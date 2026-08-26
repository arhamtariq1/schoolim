# ADR-0004 — Prisma over Drizzle

**Status:** Accepted · **Date:** 2026-08-21

## Context

Every query in the product must be tenant-scoped. Forgetting the scope on a single query is a
catastrophic bug (ADR-0002). The team is small; developer safety outweighs raw SQL control.

## Decision

Prisma 7, chosen primarily because **client extensions provide a single interception point** where
the tenant filter can be injected into every query for every model, failing closed when the tenant
context is absent.

Complex reporting queries that Prisma expresses poorly use `$queryRaw` with explicit `school_id`
predicates — a small, reviewable, auditable set of exceptions still covered by RLS.

## Consequences

- Tenant scoping becomes structurally impossible to forget, rather than a code-review
  responsibility.
- Excellent type inference; migrations and schema are first-class.
- Cost: less control over generated SQL; some analytical queries need raw SQL.
- Cost: raw queries bypass the extension, so each one is an explicit review checkpoint.

## Alternatives

- **Drizzle** — leaner, closer to SQL, better for complex queries. Rejected because tenant scoping
  would have to be composed manually at every call site. That single trade decides it here.
- **TypeORM** — rejected; weaker types, poorer migration story.
- **Kysely** — excellent query builder, but no schema/migration story and the same manual-scoping
  problem as Drizzle.
