# Architecture Decision Records

One file per significant decision. Format: Context → Decision → Consequences → Alternatives.

Write an ADR when a choice is hard to reverse, when you spent more than an hour deciding, or when a
future reader would reasonably ask "why on earth did they do it this way".

| #                                                    | Decision                                                         | Status                    |
| ---------------------------------------------------- | ---------------------------------------------------------------- | ------------------------- |
| [0001](0001-turborepo-monorepo.md)                   | Turborepo + pnpm monorepo                                        | Accepted                  |
| [0002](0002-shared-schema-rls-multitenancy.md)       | Shared schema + RLS multi-tenancy                                | Accepted                  |
| [0003](0003-own-auth-not-supabase-auth.md)           | Own the authentication layer                                     | Accepted                  |
| [0004](0004-prisma-over-drizzle.md)                  | Prisma over Drizzle                                              | Accepted                  |
| [0005](0005-rest-with-shared-zod-contracts.md)       | REST + shared zod contracts, not tRPC/GraphQL                    | Accepted                  |
| [0006](0006-always-on-api-host.md)                   | Always-on API host rather than serverless                        | Proposed                  |
| [0007](0007-money-as-integer-minor-units.md)         | Money as integer minor units                                     | Accepted                  |
| [0008](0008-school-groups-and-multi-campus.md)       | School groups: campus is the tenant, group is a layer above      | Accepted                  |
| [0009](0009-global-sign-in.md)                       | Sign in with email and password alone; school resolved after     | Accepted                  |
| [0010](0010-self-serve-signup-and-trial.md)          | Self-serve signup with a 30-day trial                            | Accepted                  |
| [0011](0011-mail-port-and-smtp-driver.md)            | `MailPort` with an SMTP driver, not Resend, for now              | Accepted                  |
| [0012](0012-email-verification.md)                   | Verify the owner's email at signup; nag rather than block        | Accepted                  |
| [0016](0016-requests-as-conversations.md)            | Requests are conversations with a status, not an approval engine | Accepted                  |
| [0017](0017-timetables-are-the-calendar-source.md)   | Timetables are the source of truth; the calendar reads them      | Accepted                  |
| [0018](0018-parent-fee-vouchers.md)                  | Parents read fee vouchers through their own routes               | Accepted                  |
| [0019](0019-marketing-surface-motion.md)             | Lenis, a display scale and a soft palette, marketing only        | Accepted, amended by 0020 |
| [0020](0020-marketing-revamp-motion-and-previews.md) | Motion set pieces and labelled product previews, marketing only  | Accepted                  |
