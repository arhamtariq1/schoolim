# ADR-0002 — Shared schema + `school_id` + RLS for multi-tenancy

**Status:** Accepted · **Date:** 2026-08-21

## Context

Many schools, each requiring completely isolated data. Expected scale: ~10 schools in year one,
perhaps 100–300 within three years, each with 100–2,000 students. Operated by a very small team. A
cross-tenant leak would be an extinction event for the business.

## Decision

One PostgreSQL database, one schema, a `school_id` column on every tenant table, with **three
independent enforcement layers**:

1. Request-scoped tenant context in AsyncLocalStorage (`nestjs-cls`)
2. A Prisma client extension injecting the tenant filter into every query, failing closed when no
   tenant context is present
3. PostgreSQL Row Level Security policies, with the application connecting as a role that lacks
   `BYPASSRLS`

`schools.shard_key` exists from day one so a single large tenant can later be moved to a dedicated
database without any product-code change.

## Consequences

- One migration serves every school. Onboarding a school is an `INSERT`.
- Cross-tenant analytics and support tooling are trivial.
- Cost per tenant is near zero, which is what makes a low monthly price viable.
- **A missing `school_id` on a new table is a critical bug.** Mitigated by a CI gate on migration
  diffs and an isolation test suite that also runs with layer 2 disabled.
- RLS adds one `SET LOCAL` per transaction — negligible, and it works correctly with a
  transaction-mode connection pooler.

## Alternatives

- **Schema per tenant** — rejected. N-schema migrations, connection-pool pressure, schema drift. It
  looks safer and is operationally far worse; current guidance is explicit that it is rarely right
  for a new SaaS.
- **Database per tenant** — rejected for v1. Correct only for hard compliance or contractual
  isolation requirements, which do not exist here. The `shard_key` escape hatch preserves the
  option.
