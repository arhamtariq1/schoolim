# Architecture Decision Records

One file per significant decision. Format: Context → Decision → Consequences → Alternatives.

Write an ADR when a choice is hard to reverse, when you spent more than an hour deciding, or when
a future reader would reasonably ask "why on earth did they do it this way".

| # | Decision | Status |
|---|---|---|
| [0001](0001-turborepo-monorepo.md) | Turborepo + pnpm monorepo | Accepted |
| [0002](0002-shared-schema-rls-multitenancy.md) | Shared schema + RLS multi-tenancy | Accepted |
| [0003](0003-own-auth-not-supabase-auth.md) | Own the authentication layer | Accepted |
| [0004](0004-prisma-over-drizzle.md) | Prisma over Drizzle | Accepted |
| [0005](0005-rest-with-shared-zod-contracts.md) | REST + shared zod contracts, not tRPC/GraphQL | Accepted |
| [0006](0006-always-on-api-host.md) | Always-on API host rather than serverless | Proposed |
| [0007](0007-money-as-integer-minor-units.md) | Money as integer minor units | Accepted |
| [0008](0008-school-groups-and-multi-campus.md) | School groups: campus is the tenant, group is a layer above | Accepted |
