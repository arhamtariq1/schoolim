# Ilm — Multi-Tenant School Management SaaS

> Working codename. One core product, many schools. Not a portal per school.

**Phase 0 is in progress.** The foundations are built and proven: tenant isolation, the guard chain,
authentication, the design-system primitives and both app shells. No school-facing features yet —
that is Phase 1. Read `docs/` before opening an editor; `docs/20-phase-0-build-plan.md` tracks what
is done.

## Start here

| Order | Document                                                                             | Why                                                                           |
| ----- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| **0** | **[docs/00-START-HERE.md](docs/00-START-HERE.md)**                                   | **The entire plan in a 20-minute read. Start here.**                          |
| 1     | [docs/01-vision-and-scope.md](docs/01-vision-and-scope.md)                           | What we are building and what we deliberately are not                         |
| 2     | [docs/02-feasibility-and-market.md](docs/02-feasibility-and-market.md)               | Is this viable, who else is in the market, what wins                          |
| 3     | [docs/03-architecture.md](docs/03-architecture.md)                                   | System shape, boundaries, request lifecycle                                   |
| 4     | [docs/04-multi-tenancy-and-security.md](docs/04-multi-tenancy-and-security.md)       | The single most important document in this repo                               |
| 5     | [docs/05-tech-stack.md](docs/05-tech-stack.md)                                       | Every library, pinned, with a reason                                          |
| 6     | [docs/06-repo-structure.md](docs/06-repo-structure.md)                               | Turborepo layout and package boundaries                                       |
| 7     | [docs/07-data-model.md](docs/07-data-model.md)                                       | Tables, keys, constraints, invariants                                         |
| 8     | [docs/08-rbac-and-roles.md](docs/08-rbac-and-roles.md)                               | Roles, permissions, what each person actually sees                            |
| 9     | [docs/09-page-inventory.md](docs/09-page-inventory.md)                               | Every screen in the school portal and what it does                            |
| 9b    | [docs/modules/](docs/modules/)                                                       | Functional specification per domain                                           |
| 10    | [docs/10-ux-and-design-system.md](docs/10-ux-and-design-system.md)                   | How we make it "next level" instead of a 20-item sidebar                      |
| 11    | [docs/11-api-conventions.md](docs/11-api-conventions.md)                             | Contract rules between API and apps                                           |
| 12    | [docs/12-engineering-rules.md](docs/12-engineering-rules.md)                         | Non-negotiables. Read before every PR                                         |
| 13    | [docs/13-infrastructure-and-deployment.md](docs/13-infrastructure-and-deployment.md) | Free-tier reality check and the path to production                            |
| 14    | [docs/14-roadmap-and-phases.md](docs/14-roadmap-and-phases.md)                       | Phase plan with exit criteria                                                 |
| 15    | [docs/15-risks-and-open-decisions.md](docs/15-risks-and-open-decisions.md)           | What can kill this, and what still needs a decision                           |
| 16    | [docs/16-ui-principles.md](docs/16-ui-principles.md)                                 | **Binding rules for every piece of UI work.** Read before writing a component |
| —     | [docs/adr/](docs/adr/)                                                               | Architecture Decision Records                                                 |

## The one-paragraph summary

A single NestJS API and two Next.js apps (school portal + super-admin console) in a Turborepo,
backed by one PostgreSQL database using shared-schema multi-tenancy with row-level security. Schools
are tenants. Every tenant row carries `school_id`, enforced simultaneously by an application-layer
query scope and a database RLS policy. The commercial engine is the fee module: configurable fee
heads, plans, discounts and a monthly voucher run that is idempotent, resumable and auditable.
Everything a school might want to customise is **data**, never a code branch.

## The rule that this whole product exists to enforce

> Your previous portal became unmanageable because one school's requirements were allowed to become
> code. In this codebase, a school-specific requirement is either configuration, a feature flag, or
> it is not built.

There is no `if (schoolId === 'x')` in this repository. Ever. See `docs/12-engineering-rules.md`.

## Running it locally

Requires Node 22 and pnpm 10 (see `.nvmrc`).

```bash
pnpm install

# Start PostgreSQL. Two options — both give the same database, port, roles and
# passwords, so .env is correct either way.
pnpm db:up          # Docker Compose (the documented default)
pnpm db:local       # a project-owned PostgreSQL from node_modules, needing no
                    # Docker. Leave it running, like `docker compose up`.

cp .env.example .env

pnpm verify:rls-role                            # prove the app role cannot bypass RLS
pnpm --filter @ilm/db exec prisma migrate deploy
pnpm build

pnpm --filter @ilm/api dev                      # API      :4000
pnpm --filter @ilm/portal dev                   # portal   :3000
pnpm --filter @ilm/admin dev                    # platform :3001
```

`pnpm db:local` exists because Docker Desktop needs the WSL 2 backend, which is not available on
every Windows machine. It is a fallback, not a replacement — Docker Compose stays the documented
default and is what CI uses.

**Tenants resolve from the hostname**, so the portal is reached at `{slug}.localhost:3000`, never at
`localhost:3000`. A login page that made you pick a school would leak the list of schools.

## Verifying

```bash
pnpm turbo run lint typecheck test build
```

The suites include the **tenant-isolation suite** and the **structural RLS gate**. Neither can skip
when no database is present: a suite that silently skips is a green build that proves nothing, and
what these two prove is the one thing that ends the company if it breaks.
