# 20 — Phase 0 Build Plan

`14` §P0 is the *checklist*. This is the **execution order** — what gets built, in what sequence, with
what proves each step done. Follow it top to bottom; the dependencies are real.

> **Phase 0 ships no features.** Not one screen a school would pay for. It exists to prove the
> tenancy model and to make every later phase cheap. Resist the urge to add a student list.

---

## 1. Where we actually are

| | State |
|---|---|
| Workspace | ✅ Turborepo + pnpm 10.23, Node 22, `apps/*` `packages/*` `tooling/*` globs |
| Shared config | ✅ eslint (base/boundaries/nest/next), prettier, 4 tsconfig presets, tailwind theme |
| Package skeletons | ⚠️ `contracts` `db` `ui` `utils` exist but export only `PACKAGE_NAME` |
| Local stack | ✅ `docker-compose.yml` — Postgres 17, Redis 7, Mailpit · `ilm_app` NOBYPASSRLS role |
| `apps/` | ❌ Does not exist |
| Git | ❌ **78 files staged, zero commits** |
| `tooling/scripts/check-rls.mjs` | ❌ Referenced by `package.json:check:rls`, not written |

**Net: the scaffolding is real, the product is empty.** That is exactly the right place to start.

---

## 2. The ordering principle

Three rules decide the sequence, and they override any preference for building something visible early:

1. **The isolation suite comes before the features it protects.** It is the Phase 0 exit criterion
   (`14`), so it runs from WP6 onward on every commit — not written at the end to satisfy a checkbox.
2. **Bottom-up through the dependency graph.** `utils` → `contracts` → `db` → `api` → `ui` → apps.
   `eslint-plugin-boundaries` already enforces this; building against the grain means fighting the linter.
3. **Nothing merges without its CI gate existing.** The RLS gate is written *with* the first RLS
   migration (WP4), not after twelve tables exist.

```
WP0 baseline commit
   └─ WP1 local stack verified
        ├─ WP2 @ilm/utils ──┐
        └─ WP3 @ilm/contracts┤
                             └─ WP4 @ilm/db: schema v0 + RLS + gate
                                  └─ WP5 tenant context + TenantPrisma
                                       └─ WP6 ISOLATION SUITE  ◀── gate 1
                                            └─ WP7 apps/api skeleton
                                                 └─ WP8 auth
                                                      └─ WP9 guards ◀── gate 2
                                                           └─ WP10 audit
   WP11 @ilm/ui ──┬─ WP12 apps/web shell ─┐
                  └─ WP13 apps/admin shell┴─ WP14 CI ◀── gate 3
                                               └─ WP15 runbooks + deploy ◀── gate 4 = P0 exit
```

---

## 3. The work packages

### WP0 — Baseline commit
Nothing is committed. Every later diff needs something to diff against.
**Done when:** one commit, `chore: scaffold monorepo`, containing the current 78 files plus the new
`17`/`18`/`19`/`20` docs.

### WP1 — Local stack verified
`docker compose up -d`; confirm Postgres 17, Redis, Mailpit. Then the check that matters:
**connect as `ilm_app` and prove it cannot see a row that RLS forbids.** If the role bootstrap in
`tooling/docker/init/01-app-role.sql` is wrong, every later isolation test passes for the wrong reason.
**Done when:** a throwaway table with an RLS policy returns 0 rows to `ilm_app` and N rows to `ilm`.

### WP2 — `@ilm/utils`
No dependencies; everything imports it.
- **Money** — integer minor units. `toMinor` / `fromMinor` / `formatPKR` / `allocate`. No floats.
  Property-tested: allocation never loses or invents a paisa (`12` R3).
- **Dates** — `timestamptz` in UTC, render in school timezone, `Asia/Karachi` default. Academic
  calendar dates are `date`, not timestamps (`03` §8).
- **`BRAND`** — the single constant holding the product name (D4 containment rule).
- Ids, slugs, `Result` type, `assertNever`.

### WP3 — `@ilm/contracts`
Imports nothing from `@ilm/db` — ever (`06` §52).
- zod base schemas · the pagination/envelope shape · error codes (`11`)
- **The role → permission matrix** (`08`), typed, exported as the single source both API and UI read
- API route constants

### WP4 — `@ilm/db` — schema v0, RLS, and the gate
Prisma 7. Tables: `schools`, `platform_users`, `users`, `roles`, `user_roles`, `refresh_tokens`,
`audit_logs`.

Every tenant-scoped table, in the same migration (`CLAUDE.md`):
`school_id NOT NULL` · `ENABLE` + `FORCE ROW LEVEL SECURITY` + `tenant_isolation` policy ·
a `school_id`-leading index · registration in `TENANT_MODELS`.

**Write `tooling/scripts/check-rls.mjs` in this WP.** It introspects the database and fails if any
table has a `school_id` without all four. The gate ships with the first migration, not after the
twelfth.
> ⚠️ `audit_logs` and attendance are partitioned monthly from the first migration (`07` §8).
> Retrofitting partitioning onto a live table is a migration you do not want to write.

### WP5 — Tenant context + `TenantPrisma`
`nestjs-cls` AsyncLocalStorage · the Prisma client extension injecting `where: { schoolId }` on reads
and stamping writes · two clients: app role (RLS-enforcing) and admin role (migrations + platform).
**The extension throws if there is no context.** Failing closed is the whole design (`04` §2).

### WP6 — The isolation suite ◀ **gate 1**
Vitest + Testcontainers, real Postgres. Seeds School A and School B, then asserts A cannot list, read,
update or delete a single B row — **and repeats every assertion with the Prisma extension disabled**,
proving RLS holds alone.
**Nothing after this point merges with this suite red.**

### WP7 — `apps/api` skeleton
NestJS 11 on Fastify, **TypeScript 5.9** (not 7 — `00` §5). zod-validated env that refuses to boot
when malformed. pino with `requestId`/`schoolId`/`userId` on every line. `/health`.
`AllExceptionsFilter` → `application/problem+json` (`11`).

### WP8 — Auth
argon2id · `jose` JWTs, 15-min access in an httpOnly cookie · opaque refresh tokens stored hashed,
rotated, **with reuse detection** · login, refresh, logout, invite-accept, password reset.
`platform_users` get a separate table, separate cookie name and separate login route — a tenant JWT
must never satisfy a platform guard (`04` §6). **2FA on platform accounts is mandatory**, wired here
even though `apps/admin` lands in P5.

### WP9 — Guards ◀ **gate 2**
`AuthGuard` → `TenantGuard` → `RbacGuard`, in that order. `TenantGuard` checks the JWT claim **and**
the request host; a mismatch is a 401. Cross-tenant reads return **404, never 403** (`00` §4).

### WP10 — `AuditInterceptor`
Every non-GET route → append-only `audit_logs` with actor, action, entity, before, after.

### WP11 — `@ilm/ui`
Read `16-ui-principles.md` in full first — it is binding, and its §14 checklist is part of done.
Semantic tokens from `packages/config/tailwind/theme.css` · shadcn/ui copied in, not depended on ·
`lucide-react` re-exported through `@ilm/ui/icons` at four sizes · Button, Input, Select, Dialog,
Table primitives, Toast, `<Money>`, `<DateDisplay>`.
`@ilm/ui` may not import `@ilm/contracts` (`06` §55).

### WP12 — `apps/web` shell
Next.js 16 + React 19. App shell: **sidebar generated from permissions, max 8 items** (`00` §6),
topbar, ⌘K skeleton, tenant theming by CSS variable. `next-intl` wired from day one even though v1 is
English-only (`03` §8). Login → an empty dashboard, end to end.

### WP13 — `apps/admin` shell
Same shell, platform token type, separate cookie. Login → empty dashboard. No features.

### WP14 — CI ◀ **gate 3**
lint · typecheck · test · build · **isolation suite** · `check:rls` · secret scan ·
**the brand grep** (`ilm` outside the four permitted places fails the build — D4 containment).
**Under 5 minutes**, or it stops being run.

### WP15 — Runbooks + deploy ◀ **gate 4 = Phase 0 exit**
RB-02 (read-only mode), RB-03 (rollback), RB-06 (credential rotation) written and **rehearsed once**
(`18` §3). Migrations run as a separate approved step, never automatically on deploy (`13` §4).
`web` + `admin` on Vercel; `api` on the D1 host; Supabase as plain Postgres.

---

## 4. The four gates

| Gate | After | Proves |
|:--:|---|---|
| **1** | WP6 | School A cannot read one School B row — **with L2 disabled** |
| **2** | WP9 | A request with no tenant context, or a mismatched host, fails closed |
| **3** | WP14 | A new tenant table without RLS, an index or registration cannot merge |
| **4** | WP15 | It runs somewhere other than your laptop, and you can roll it back |

**Do not pass a gate on "it looks right".** Each is a test that runs in CI or a runbook you executed.

---

## 5. Sequencing notes

- **WP2/WP3 are parallel.** Everything else is strictly ordered.
- **WP11–WP13 (UI) can start any time after WP3**, since `@ilm/ui` is domain-agnostic and the shell
  only needs the permission matrix. Useful when you want a break from tenancy plumbing.
- **The realistic estimate is 2–3 weeks full-time** (`14`). WP4–WP6 are half of it and feel slow
  because nothing is visible. That is correct — it is the phase that decides whether the product
  survives its twentieth school.

## 6. What is deliberately *not* in Phase 0

Students, fees, attendance, dashboards with real numbers, subscriptions, and every screen in
`09-page-inventory.md`. Also: BullMQ (P4), Sentry wiring (P0 optional, P5 mandatory), and anything
from `17`/`19` that needs a lawyer or a bank — those run **in parallel, off-keyboard, starting P2**.
