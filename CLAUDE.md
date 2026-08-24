# CLAUDE.md — House rules for this repository

Read `docs/12-engineering-rules.md` in full before writing code. This file is the condensed version
that must never be violated.

**Before writing any UI — a component, a page, a style — read `docs/16-ui-principles.md` in full.**
It is binding, and its §14 checklist is part of the definition of done.

## What this is
A multi-tenant school-management SaaS. Turborepo · NestJS API · two Next.js apps · PostgreSQL with
row-level security. Planning lives in `docs/`; read it before proposing anything.

## The ten non-negotiables

1. **No school-specific code.** No `if (schoolId === '…')`, ever. It is configuration, a feature
   flag, or it is not built.
2. **Tenant scope is never a function parameter.** It comes from CLS. A method signature containing
   `schoolId: string` is wrong.
3. **Money is integer minor units (paisa) in code**, `numeric(14,2)` in the database. Never a float.
   Every money field ends in `Minor`.
4. **Financial records are append-only.** No update to an amount on a paid voucher, no delete of a
   payment. Corrections are reversing entries.
5. **Every batch operation is idempotent and keyed**, with a `job_runs` record and a resumable cursor.
6. **Business logic lives in services** — never in controllers, React components or SQL.
7. **Validate at every boundary** with the shared zod schema from `@ilm/contracts`.
8. **Every mutation is audited** — actor, action, entity, before, after.
9. **Module boundaries follow the layer order** in `docs/03-architecture.md` §3 and are linter-enforced.
10. **No `any`, no `@ts-ignore`** without an issue link and an expiry date.

## UI, in five lines
- **shadcn/ui on Radix, copied into `@ilm/ui`.** No second component library, ever.
- **`lucide-react` is the only icon set**, imported through `@ilm/ui/icons`, at one of four sizes.
- **Semantic tokens only** — no raw hex, no arbitrary Tailwind values, no inline styles.
- **Money through `<Money>`, dates through `<DateDisplay>`**, lists through `<DataTable>`.
- **Loading, empty, error and permission-denied states are part of "done".** Not a follow-up.

## Before adding a tenant-scoped table
All four, in the same migration, or CI fails:
1. `school_id uuid NOT NULL REFERENCES schools(id)`
2. `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` + the `tenant_isolation` policy
3. An index whose leading column is `school_id`
4. Registration in `TENANT_MODELS`

And answer one question in the PR: **how does a row in this table get erased or anonymised?**
See the retention table in `docs/17-legal-and-compliance.md` §4. No answer, no merge.

## The brand name is a placeholder
`ilm` is not the product name (decision D4 is deferred). It may appear **only** in the npm scope
`@ilm/*`, the cookie prefix, the local database name, and Docker container names. Never in UI copy,
emails, PDFs or seeded templates — those read `BRAND` from `@ilm/utils`. CI greps for this.

## Before opening a PR
- [ ] Tenant-isolated, permission-checked on the server, audited
- [ ] Money as minor units; no float arithmetic
- [ ] Loading, empty and error states implemented
- [ ] Bulk action available if the operation could ever apply to many rows
- [ ] Tests cover the failure paths, not only the happy path
- [ ] Migration is reversible and indexed

## Conventions
Files `kebab-case.ts` · components `PascalCase.tsx` · tables `snake_case` plural · Prisma models
`PascalCase` singular · permissions `module.resource.action` · commits Conventional with a scope.

## When you are unsure
Read the relevant `docs/` file. If the answer is not there and the decision is non-obvious, write an
ADR in `docs/adr/` rather than deciding silently in a diff.

`17` legal, privacy, retention, operator access · `18` incident response and runbooks ·
`19` company, tax and invoicing.
