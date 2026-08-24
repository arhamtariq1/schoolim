# 04 — Multi-Tenancy & Security

> If you read one document in this repository, read this one. Everything else is recoverable.
> A cross-tenant data leak is not — it ends the company.

## 1. Decision: shared database, shared schema, `school_id` + RLS

| Option | Verdict |
|---|---|
| Database per tenant | Rejected for v1. N databases means N migrations, N connection pools, N backups. Correct only for enterprise/compliance isolation you do not have. |
| **Schema per tenant** | **Rejected.** Migrating 200 schemas on every deploy, connection-pool blowup, schema drift. This is the trap that looks safest and hurts most. |
| **Shared schema + `school_id` + RLS** | **Chosen.** One migration, trivial onboarding (an INSERT), cheap analytics, simple ops. Industry default for B2B SaaS. |

**Escape hatch, designed in now:** because the tenant key is a column and not a schema, a future
enterprise school can be moved to a dedicated database with zero product-code change — you point a
different connection string at the same schema. Record this in `schools.shard_key` (default `main`)
from day one even though we only ever use one shard in v1.

## 2. Three independent layers of isolation

Never rely on one. Each layer assumes the others are broken.

### Layer 1 — Request context (`nestjs-cls`)
`TenantGuard` resolves the school and stores it in AsyncLocalStorage. Nothing downstream may take a
`schoolId` as a function argument from user input. There is exactly one source of truth per request.

```ts
// shared/tenancy/tenant.guard.ts
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private cls: ClsService, private schools: SchoolLookupService) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<Request>();
    const auth = req.user; // set by AuthGuard

    if (auth.type === 'platform') {
      // Super admin. Tenant scope only via an explicit, audited impersonation header.
      const target = req.headers['x-impersonate-school'];
      if (!target) return true;                 // platform-scoped route
      await this.schools.assertImpersonationAllowed(auth.userId, String(target));
      this.cls.set('schoolId', String(target));
      this.cls.set('impersonating', true);
      return true;
    }

    const fromToken = auth.schoolId;
    const fromHost  = req.headers['x-school-slug'];
    if (!fromToken) throw new UnauthorizedException();

    // The host the user is on must be the school their token was issued for.
    if (fromHost && !(await this.schools.slugMatches(fromToken, String(fromHost)))) {
      throw new UnauthorizedException('TENANT_MISMATCH');
    }

    this.cls.set('schoolId', fromToken);
    return true;
  }
}
```

### Layer 2 — Query scoping (Prisma client extension)
A Prisma extension injects `where: { schoolId }` into every read and `data: { schoolId }` into every
write, for every model tagged as tenant-scoped. Developers cannot forget it, because they never
write it.

```ts
// shared/prisma/tenant.extension.ts
const TENANT_MODELS = new Set([
  'Student','Guardian','Enrollment','Staff','FeeVoucher','FeeVoucherLine','Payment',
  'Expense','AttendanceRecord','ClassRoom','Section','AcademicSession', /* … */
]);

export const tenantExtension = (cls: ClsService) =>
  Prisma.defineExtension((client) =>
    client.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            if (!TENANT_MODELS.has(model)) return query(args);

            const schoolId = cls.get('schoolId');
            if (!schoolId) throw new Error(`TENANT_CONTEXT_MISSING for ${model}.${operation}`);

            if (READ_OPS.has(operation) || WRITE_FILTER_OPS.has(operation)) {
              args.where = { AND: [args.where ?? {}, { schoolId }] };
            }
            if (operation === 'create')     args.data = { ...args.data, schoolId };
            if (operation === 'createMany') args.data = toArray(args.data).map(d => ({ ...d, schoolId }));

            return query(args);
          },
        },
      },
    }),
  );
```

Note the fail-closed behaviour: **missing tenant context throws.** It does not fall back to
"return everything".

### Layer 3 — PostgreSQL Row Level Security
The database refuses to return other tenants' rows even if layers 1 and 2 are bypassed — including
by a raw `$queryRaw`, a leaked connection string, or a SQL-injection bug.

```sql
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE students FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON students
  USING      (school_id = ANY (string_to_array(
                current_setting('app.current_school_ids', true), ',')::uuid[]))
  WITH CHECK (school_id = ANY (string_to_array(
                current_setting('app.current_school_ids', true), ',')::uuid[]));
```

**Why an array when there is only ever one school?** Because there will not always be one. A school
group's consolidated report reads across the campuses the token proves membership of
(`ADR-0008`). For every ordinary request the array holds exactly one id and the planner still
reduces the predicate to an index lookup on the `school_id`-leading index, so it costs nothing —
but rewriting this policy across every tenant table of a live production database later is the one
part of multi-campus that cannot be done cheaply. Write it in this shape from the first migration.

**Writes are always single-campus.** `WITH CHECK` passes for any id in the array, so the array is
never allowed to hold more than one entry on a write path — enforced in `TenantPrisma`, not left to
convention.

The application connects as a role **without** `BYPASSRLS`. Migrations and the platform/super-admin
connection use a second, separate role that does have it. Two connection strings,
`DATABASE_URL` and `DATABASE_ADMIN_URL`, and the tenant code path never sees the second.

`TenantPrisma` sets the GUC inside the transaction so it works with a transaction-mode pooler:

```ts
async run<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>, mode: 'write' | 'read' = 'write') {
  const ids = this.cls.getOrThrow('schoolIds');            // always ≥ 1
  if (mode === 'write' && ids.length !== 1)
    throw new Error('MULTI_SCHOOL_WRITE_FORBIDDEN');        // see ADR-0008 §4
  return this.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_school_ids', ${ids.join(',')}, true)`;
    return fn(tx);
  });
}
```

`set_config(..., true)` = local to the transaction, so it cannot leak across pooled connections.

### The migration checklist item that must never be skipped
Every new tenant-scoped table requires, in the same migration:
1. `school_id uuid NOT NULL REFERENCES schools(id)`
2. `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` + the `tenant_isolation` policy
3. An index whose **leading column is `school_id`**
4. Registration in `TENANT_MODELS`

A CI check greps the migration diff for `CREATE TABLE` and fails the build if any of the four is
missing. Write that check in Phase 0, before there are tables to fix.

## 3. Automated isolation testing (Phase 0 deliverable)

`apps/api/test/tenant-isolation.e2e-spec.ts` — runs on every PR against a real Postgres:

1. Seed two schools, A and B, each with students, vouchers, payments and staff.
2. For **every** registered tenant model, authenticated as a School A admin:
   - list → assert zero School B rows
   - get-by-id with a School B id → assert 404 (**never 403**; a 403 confirms existence)
   - update/delete a School B id → assert 404 and assert the row is unchanged
3. Repeat with the tenant Prisma extension disabled to prove **RLS alone** still blocks it.
4. Assert that any query executed with no CLS context throws rather than returning rows.

If a developer adds a model and forgets the isolation wiring, this suite fails. That is the point.

## 4. Authentication

### Decision: own the auth, in NestJS. Do not use Supabase Auth.

The stated plan is to migrate off Supabase to plain PostgreSQL once there is a paying customer.
Supabase Auth stores users in `auth.users` with Supabase-specific JWT issuance and GoTrue semantics.
Coupling logins to it means the migration becomes "re-authenticate every user at every school" —
the worst possible thing to do to a live product. Use Supabase in Phase 0 as *hosted Postgres and
object storage only*.

### Design

| Element | Choice |
|---|---|
| Password hashing | `argon2id` (`@node-rs/argon2`), m=19456 t=2 p=1 |
| Access token | JWT, 15 min, httpOnly + Secure + SameSite=Lax cookie, `ilm_at` |
| Refresh token | Opaque 256-bit random, 30 days, **stored hashed** (SHA-256), rotated on every use |
| Reuse detection | A used refresh token presented again revokes the entire family and forces re-login |
| Session record | `sessions(id, user_id, family_id, ip, user_agent, last_used_at, revoked_at)` |
| Login throttle | `@nestjs/throttler` + per-account exponential lockout after 5 failures |
| MFA | TOTP for Owner/Principal/Accountant and **mandatory for every platform admin** (Phase 5) |
| Invitations | Signed, single-use, 72 h expiry; role is baked into the invite |
| Student/parent access | Same user table, `must_change_password` on first login; bulk credential generation with printable slips |

### JWT claims
```json
{
  "sub": "user-uuid",
  "typ": "tenant",
  "sid": "school-uuid",
  "rol": ["ACCOUNTANT"],
  "ver": 3,
  "iat": 1750000000,
  "exp": 1750000900
}
```
`ver` is `users.token_version`. Changing a role, disabling a user, or a password reset increments it
and every existing access token dies at once — without a Redis blocklist.

## 5. Authorisation

Two tiers, both required:

1. **Role → permission matrix** (static, in `@ilm/contracts`) — coarse capability, e.g.
   `fees.voucher.generate`. Checked by `RbacGuard`.
2. **Row-level scope rules** (dynamic, in services) — a teacher may read attendance only for
   sections they are assigned to; a student may read only their own vouchers. Expressed as a
   `scopeFor(user)` clause the service composes into the query, never as a post-fetch filter.

Full matrix in `08-rbac-and-roles.md`.

**Rule:** a permission check that happens only in the UI does not exist. The UI hides; the API decides.

## 6. Super admin & impersonation

- Platform users live in a separate table `platform_users` with their own login route and their own
  cookie name. A tenant JWT can never satisfy a platform guard, and vice versa.
- **2FA (TOTP) is mandatory on every `platform_users` account.** A compromised platform account
  reaches every school; a second factor is not optional at that blast radius.
- Impersonation issues a short-lived (30 min) tenant token stamped `act: "platform-user-uuid"`.
  **No silent renewal** — re-entry is a new, separately audited session.
- Every impersonated session writes an `audit_logs` entry on start, on end, and on every mutation.
  **The audit write happens in the same transaction that issues the token: no record, no token.**
- The audit record requires a **typed reason** and, where the school raised a ticket, its reference.
- **The school sees its own impersonation history** in its own audit view — not only you. If a school
  cannot independently verify that platform staff entered its data, the commitment is theatre.
- The school portal shows a persistent, unmissable banner: *"Support session active — platform staff
  is viewing your workspace."* Trust is the product; hidden impersonation destroys it.
- Impersonation is **read-only by default**. Write access requires an explicit reason string and a
  second confirmation, and it is retained in the audit record.
- **Full-tenant export while impersonating** requires a typed reason, is rate-limited to one per
  school per day, and raises an alert. It is the one action that turns a support session into a
  data exfiltration.
- A future support hire gets a platform role with **impersonation but not export or delete**. Design
  the role now — the permission matrix already supports it.

> The **policy** governing when this access is acceptable, who reviews it, and what is promised to
> schools contractually lives in `17-legal-and-compliance.md` §5. It is published in the DPA. These
> controls are what make that policy enforceable rather than aspirational.

## 7. Data protection

| Concern | Control |
|---|---|
| PII at rest | Postgres-level encryption from the host; CNIC/B-Form numbers encrypted column-side (`pgcrypto`) with a KMS-held key. **Collecting CNIC/B-Form is a per-school setting, never a required product field** (`17` §2) |
| PII in logs | `pino` redaction paths for `password`, `token`, `cnic`, `phone`, `authorization` |
| Backups | Nightly logical dump + PITR once on paid Postgres. **Restore drill every quarter**, documented. A backup you have never restored is not a backup. |
| Deletion | Soft delete (`deleted_at`) for operational records; hard delete for a full tenant offboarding, executed by a documented, audited runbook (RB-08) after a 30-day grace period. **Per-student erasure anonymises rather than deletes** — see the retention table in `17` §4 |
| Retention | Per data class, defined in `17` §4. Every new table must answer *"how does a row here get erased or anonymised?"* before it ships |
| Export | Every school can export its complete data as ZIP (Excel + PDFs) at any time. This removes the biggest objection in the sales conversation. |
| Rate limits | Global + per-IP + per-account; stricter on auth, exports and job endpoints |
| Uploads | Type allow-list, size cap, extension/MIME agreement check, random stored filenames, served from a separate origin, `Content-Disposition: attachment` |
| Secrets | Never in the repo. `.env.example` documents names only. Rotate at every phase boundary. |
| Headers | `helmet` + strict CSP on both Next apps; no inline scripts |

## 8. Security review gates

- **Phase 0 exit:** tenant-isolation suite green; RLS on every table; auth flows penetration-checked
  manually against the OWASP ASVS L1 list.
- **Phase 2 exit (money):** financial invariants tested (see `modules/fees-and-finance.md` §9);
  no endpoint can mutate a paid voucher.
- **Phase 5 exit (pre-launch):** dependency audit, secret scan in CI, external review of the auth and
  tenancy code by someone who did not write it.

**Sources:** [Multi-tenant SaaS on Postgres](https://clickhouse.com/resources/engineering/multi-tenant-saas-postgres-architecture) · [RLS vs schema-per-tenant](https://aliasghar.me/blog/multi-tenant-saas-data-isolation) · [Postgres multi-tenancy patterns compared](https://www.adiagr.com/blog/07-saas-postgres-multitenancy-patterns/)
