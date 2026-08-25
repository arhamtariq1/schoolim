# 12 — Engineering Rules

> These exist because the previous portal became unmaintainable. Each rule maps to a specific way
> that happened. They are enforced by tooling wherever possible, because rules that depend on
> discipline decay in month four.

---

## The ten non-negotiables

### R1 — No school-specific code. Ever.

There is no `if (schoolId === '…')`, no `if (school.name === 'ABC School')`, no per-school file. A
school-specific requirement resolves to exactly one of:

1. **Configuration** — a setting, a template, a fee-plan shape, a custom field
2. **A feature flag** — `school_features`, so others can opt in later
3. **Declined** — and if the school insists, it becomes a paid, generalised feature on the roadmap

_Enforced:_ an ESLint rule banning `schoolId ===` comparisons against literals, plus a CI grep.

### R2 — Tenant scope is never a parameter.

No service method accepts `schoolId` from a caller. It comes from CLS, always. A method signature
containing `schoolId: string` is a code-review rejection.

_Enforced:_ the Prisma extension throws when CLS has no tenant; the isolation E2E suite proves it.

### R3 — Money is integer minor units in code, `numeric(14,2)` in the database.

No `number` arithmetic on rupees. Use `@ilm/utils/money`. A float in a money path is a rejected PR.

_Enforced:_ an ESLint rule banning arithmetic operators on identifiers matching
`/amount|fee|price|total|balance/i` outside the money utility.

### R4 — Financial records are append-only.

No `UPDATE` that changes an amount on a paid voucher. No `DELETE` on a payment. Corrections are
reversing entries with a reason and an actor.

_Enforced:_ database `REVOKE DELETE` on `payments` and `audit_logs` for the application role, plus a
trigger that blocks amount changes on `PAID` vouchers.

### R5 — Every batch operation is idempotent and keyed.

Every job and bulk endpoint has an idempotency key, a `job_runs` record, chunked processing and a
resumable cursor. Re-running does nothing the second time.

### R6 — Business logic lives in services, never in controllers, components or SQL.

Controllers map. Components render. Services decide. A component containing a fee calculation is a
rejected PR — because that calculation will be needed by the PDF, the API and the report, and it
must have exactly one implementation.

### R7 — Validate at every boundary with the shared schema.

API input, API output in dev, form input, job payloads, webhook bodies, environment variables. The
same zod schema, imported from `@ilm/contracts`. No hand-written interface duplicating a schema.

### R8 — Every mutation is audited.

Actor, action, entity, before, after, IP, request id. Automatic via `AuditInterceptor`; financial
modules additionally emit domain events. If an action is not in the audit log, it did not happen —
and you cannot answer the support call.

### R9 — Module boundaries are enforced by the linter, not by convention.

Follow the layer order in `03-architecture.md` §3. Cross-module access goes through the exported
service. No module imports another module's repository, Prisma models, or internal types.

_Enforced:_ `eslint-plugin-boundaries`.

### R10 — No `any`. No `@ts-ignore` without an issue link and an expiry date.

`strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`. `unknown` + a
type guard is always available and always better.

---

## 1. TypeScript

```jsonc
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true,
  "noImplicitOverride": true,
  "noFallthroughCasesInSwitch": true,
  "verbatimModuleSyntax": true,
  "isolatedModules": true,
}
```

- Types are **inferred from zod**, not written twice. `z.infer<typeof schema>` is the type.
- No enums — use `as const` objects plus a derived union. TS enums have runtime quirks and do not
  narrow the way people expect.
- Discriminated unions for anything with variants (payment methods, request types, notification
  channels). Then `switch` with an `assertNever` default, so adding a variant produces a compile
  error at every site that must handle it.
- Branded types for ids: `type StudentId = string & { __brand: 'StudentId' }`. Passing a section id
  where a student id is expected then fails to compile.

## 2. Naming

| Thing           | Convention                    | Example                                     |
| --------------- | ----------------------------- | ------------------------------------------- |
| File            | kebab-case                    | `voucher-generation.service.ts`             |
| React component | PascalCase                    | `VoucherTable.tsx`                          |
| Hook            | `use` + camelCase             | `useVouchers`                               |
| Boolean         | `is`/`has`/`can`/`should`     | `isOverdue`, `canApprove`                   |
| Async function  | verb-first                    | `generateVouchers`, not `voucherGeneration` |
| DB table        | snake_case plural             | `fee_voucher_lines`                         |
| Prisma model    | PascalCase singular + `@@map` | `FeeVoucherLine`                            |
| Money field     | `…Minor` suffix in code       | `netPayableMinor`                           |
| Date-only field | `…Date`                       | `dueDate`                                   |
| Timestamp       | `…At`                         | `paidAt`                                    |
| Event           | past tense, dotted            | `payment.received`                          |
| Permission      | `module.resource.action`      | `fees.voucher.generate`                     |

Say what it is. `data`, `info`, `item`, `temp`, `handleClick2`, `utils.ts` with 40 exports — all
rejected in review.

## 3. Error handling

```ts
// Domain errors carry a code, an HTTP status, and a message written for a school accountant.
export class VoucherAlreadyPaidError extends DomainError {
  code = 'FEES_VOUCHER_ALREADY_PAID';
  status = 409;
  constructor(voucherNo: string, paidOn: Date) {
    super(`Voucher ${voucherNo} was fully paid on ${fmt(paidOn)} and cannot be cancelled.`);
  }
}
```

- Never swallow an error. Never `catch {}`. Never log-and-continue in a money path.
- Never leak a Prisma error, a stack trace, or a SQL string to a client.
- Retry only what is safe to retry, with backoff and a cap.
- Anything unexpected goes to Sentry with `schoolId` and `requestId` tags.

## 4. Service structure

```ts
@Injectable()
export class VoucherGenerationService {
  // 1. public entry points first, in the order a reader would follow
  // 2. one transaction per unit of work, opened at the top of the operation
  // 3. private helpers below, each one testable in isolation
  // 4. no method longer than ~50 lines — if it is longer, it is doing several things
}
```

- One reason to change per class. `VoucherGenerationService` generates vouchers; it does not send
  notifications — it emits an event and `comms` reacts.
- Transactions are opened by the service, passed down as `tx`, never opened inside a helper.
- Domain events (`@nestjs/event-emitter` in-process; a queue when one exists) for cross-module
  reactions. `payment.received` → receipt, notification, day-book entry, timeline entry — none of
  which the payment service knows about.

## 5. Database

- Migrations are forward-only and reviewed like code. Never edit an applied migration.
- Every migration is tested against a copy of a realistic dataset before production.
- No `prisma db push` outside a local scratch database.
- Every foreign key has an index. Every tenant index leads with `school_id`.
- `EXPLAIN ANALYZE` any query on a table expected to exceed 100k rows, before merge.
- Destructive migrations happen in two deploys: (1) add and backfill, (2) remove after the old code
  is gone. Never rename a column in one step.
- The RLS checklist from `04` §2 is part of the migration template.

## 6. Frontend

- Server state is TanStack Query. Client state is Zustand. **Never mirror server state into a
  store.**
- Query keys come from a key factory. Invalidation targets keys, never a blanket
  `invalidateQueries()`.
- Forms: React Hook Form + the shared zod resolver. Never manual `useState` per field.
- No business calculation in a component. Import it from `@ilm/utils` or fetch it from the API.
- Every mutation handles loading, error and success states explicitly. A button that can be
  double-clicked into a double payment is a bug, not a UX detail.
- Lists over ~200 rows virtualise.
- `useEffect` is for synchronising with something outside React. Data fetching in `useEffect` is a
  rejected PR.

## 7. Testing

| Layer                | Tool                                         | Target                                                                                       |
| -------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Unit — domain logic  | Vitest                                       | 90%+ on fee calculation, money, dates, scope rules. These are the ones that matter.          |
| Integration — API    | Vitest + Supertest + Testcontainers Postgres | Every endpoint: happy path, permission denied, validation failure, tenant isolation          |
| Tenant isolation     | dedicated suite                              | Every model, both with and without the Prisma extension                                      |
| RBAC matrix          | dedicated suite                              | Every (role × endpoint) pair; fails on an uncovered endpoint                                 |
| Financial invariants | dedicated suite                              | The 8 invariants in `modules/fees-and-finance.md` §9                                         |
| E2E                  | Playwright                                   | Login · admit student · generate vouchers · collect payment · mark attendance · run rollover |
| Visual               | Playwright screenshots                       | `@ilm/ui` primitives                                                                         |

Rules: tests use factories, never fixtures shared across tests. No test depends on another test's
data. Every bug fix starts with a failing test that reproduces it.

**A PR touching the fee module without tests is not reviewed.**

## 8. Git & review

- Conventional Commits with a scope: `feat(fees): idempotent monthly voucher run`
- One module or one vertical slice per PR. A four-module diff is four PRs.
- PR template: what · why · how tested · screenshots · migration notes · rollback plan
- Required to merge: typecheck, lint, unit, integration, isolation, RBAC, build, bundle budget
- Self-review the diff before requesting review. Read it as if someone else wrote it.

### Review checklist

- [ ] Tenant scoping present and not bypassable
- [ ] Permission checked on the server, not only in the UI
- [ ] Money handled as minor units
- [ ] Mutation audited
- [ ] Errors are typed, actionable, and leak nothing
- [ ] Migration is reversible and indexed
- [ ] No `any`, no `@ts-ignore`, no `console.log`
- [ ] Loading, empty and error states exist in the UI
- [ ] Tests cover the failure paths, not only the happy path
- [ ] No school-specific behaviour (R1)

## 9. Documentation

- Every module has a `README.md` explaining its domain, invariants and events.
- Every non-obvious decision becomes an ADR in `docs/adr/`. If you had to think for an hour about
  it, write it down or you will re-think it in six months.
- Comments explain **why**, never what. `// Bank requires 3 copies on one A4 — do not "simplify"` is
  a valuable comment. `// loop over students` is noise.
- These planning docs are living documents. When reality diverges, update the doc in the same PR.

## 10. Definition of Done

A feature is done when all of the following are true:

- [ ] Works for every role that should have it, and is inaccessible to every role that should not
- [ ] Tenant-isolated, permission-checked, audited
- [ ] Loading, empty, error and success states designed and implemented
- [ ] Mobile layout verified where the role uses mobile
- [ ] Bulk operation available if the action would ever be needed for many rows
- [ ] Exportable and printable if it is a list or a document
- [ ] Tested at the appropriate layers
- [ ] Documented in the module README; the OpenAPI spec regenerated
- [ ] Verified on staging with the 300-student demo tenant
- [ ] The migration has been run and rolled back once, on a copy

**"It works on my machine with 3 students" is not done.**
