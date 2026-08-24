# 06 — Repository Structure

## 1. Turborepo layout

```
ilm/
├── apps/
│   ├── api/                     NestJS 11 — the only thing that touches the database
│   ├── web/                     Next.js 16 — school portal (multi-tenant)
│   ├── admin/                   Next.js 16 — super-admin console
│   └── docs/                    Nextra — internal + school-facing documentation   (Phase 5)
├── packages/
│   ├── contracts/               zod schemas + inferred types + permission matrix
│   ├── db/                      Prisma schema, client, migrations, seeds
│   ├── ui/                      design system
│   ├── utils/                   money, dates, formatting, ids
│   ├── email/                   React Email templates
│   └── config/
│       ├── eslint/
│       ├── typescript/
│       └── tailwind/
├── tooling/
│   ├── scripts/                 db reset, seed-demo-school, generate-openapi, check-rls
│   └── docker/                  docker-compose for local Postgres + Redis + MailHog
├── docs/                        ← this planning set. Kept in-repo, updated as decisions change.
├── .github/workflows/
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
└── CLAUDE.md                    house rules for AI-assisted work in this repo
```

## 2. Package dependency graph

```
        apps/web ─┐          ┌─ apps/admin
                  ├──────────┤
                  ▼          ▼
              @ilm/ui   @ilm/contracts ◀────── apps/api
                  │          │                     │
                  └────┬─────┘                     ▼
                       ▼                       @ilm/db
                   @ilm/utils ◀────────────────────┘
                       │
                       ▼
                  @ilm/config
```

Hard rules:
- **`@ilm/db` is imported only by `apps/api`.** No Next.js app ever imports Prisma. If it did, the
  Prisma client would be bundled into a frontend and tenant enforcement would be bypassable.
- **`@ilm/contracts` imports nothing from `@ilm/db`.** It defines shapes independently, so the API
  contract can stay stable while the schema evolves. Prisma types are mapped to contract types in
  the API's mapper layer, never leaked outward.
- `@ilm/ui` may not import `@ilm/contracts`. Design-system components are domain-agnostic; a
  `<VoucherTable>` lives in `apps/web/features/fees`, not in the design system.

Enforced by `eslint-plugin-boundaries` and by a `depcheck` step in CI.

## 3. Inside `apps/api`

```
apps/api/src/
├── main.ts                      bootstrap, global pipes/filters, Swagger
├── app.module.ts
├── shared/
│   ├── prisma/                  PrismaService, TenantPrisma, tenant.extension.ts
│   ├── tenancy/                 TenantGuard, CLS setup, feature-flag service
│   ├── auth/                    AuthGuard, JWT service, session service, decorators
│   ├── rbac/                    RbacGuard, @RequirePermission, matrix loader
│   ├── audit/                   AuditInterceptor, AuditService
│   ├── errors/                  domain error classes, AllExceptionsFilter
│   ├── pagination/              cursor + offset helpers, standard list envelope
│   ├── files/                   presigned upload service, storage port
│   └── config/                  zod env schema, typed config service
├── modules/
│   └── fees/                            ← every module has exactly this shape
│       ├── fees.module.ts
│       ├── controllers/
│       │   ├── fee-plans.controller.ts
│       │   ├── vouchers.controller.ts
│       │   └── payments.controller.ts
│       ├── services/
│       │   ├── fee-plan.service.ts
│       │   ├── voucher-generation.service.ts   ← the batch engine
│       │   ├── payment.service.ts
│       │   └── defaulter.service.ts
│       ├── repositories/          only where a query is too complex for the service
│       ├── mappers/               Prisma entity → contract DTO. Never return an entity raw.
│       ├── jobs/                  queue processors
│       ├── events/                domain events emitted by this module
│       └── __tests__/
└── jobs/                        cron registration + the /internal/jobs endpoint
```

**Controller rule:** no controller method body exceeds ~10 lines. If it does, logic has leaked out
of the service.

**Service rule:** a service method that spans more than one aggregate opens a transaction and passes
`tx` down. No service calls another module's repository.

## 4. Inside `apps/web`

Organised **by feature, not by file type**. The failure mode of the old portal was 60 files in
`components/` with no way to tell what belonged together.

```
apps/web/src/
├── app/
│   ├── (public)/login/page.tsx
│   ├── (portal)/
│   │   ├── layout.tsx                    AppShell: nav + topbar + CommandPalette + tenant theme
│   │   ├── dashboard/page.tsx            renders <RoleWorkspace /> for the current role
│   │   ├── fees/
│   │   │   ├── vouchers/page.tsx
│   │   │   ├── vouchers/[id]/page.tsx
│   │   │   ├── generate/page.tsx
│   │   │   ├── plans/page.tsx
│   │   │   └── defaulters/page.tsx
│   │   └── …
│   └── api/                              BFF: /api/session, /api/files/[...path]
├── features/
│   ├── fees/{api,components,schemas,utils,types}
│   ├── students/…
│   ├── attendance/…
│   └── dashboard/workspaces/{PrincipalWorkspace,AccountantWorkspace,TeacherWorkspace,…}.tsx
├── components/
│   ├── ui/                               thin re-exports of @ilm/ui
│   ├── layout/                           AppShell, Sidebar, Topbar, TenantBranding
│   └── shared/                           StudentPicker, ClassSectionSelect, DateRangePicker
├── lib/
│   ├── api-client.ts                     fetch wrapper: cookies, problem+json → typed errors
│   ├── query-client.ts
│   ├── permissions.ts                    usePermission(), <Can permission="…">
│   └── format.ts
├── middleware.ts                         tenant slug resolution + auth redirect
└── messages/{en.json,ur.json}
```

### `features/*/api` pattern
One file per resource, hooks only. This is where the contract meets the UI:

```ts
// features/fees/api/vouchers.ts
import { voucherListQuery, voucherSchema } from '@ilm/contracts/fees';

export const voucherKeys = {
  all: ['vouchers'] as const,
  list: (f: VoucherFilters) => [...voucherKeys.all, 'list', f] as const,
  detail: (id: string) => [...voucherKeys.all, 'detail', id] as const,
};

export function useVouchers(filters: VoucherFilters) {
  return useQuery({
    queryKey: voucherKeys.list(filters),
    queryFn: () => api.get('/fees/vouchers', { query: voucherListQuery.parse(filters) }),
    placeholderData: keepPreviousData,   // no grid flicker when filters change
  });
}
```

Query-key factories are mandatory. Ad-hoc key arrays cause the invalidation bugs that make a UI feel
unreliable.

## 5. Turborepo pipeline (`turbo.json`)

```jsonc
{
  "tasks": {
    "build":      { "dependsOn": ["^build"], "outputs": [".next/**", "!.next/cache/**", "dist/**"] },
    "dev":        { "cache": false, "persistent": true },
    "lint":       { "dependsOn": ["^build"] },
    "typecheck":  { "dependsOn": ["^build"] },
    "test":       { "dependsOn": ["^build"], "outputs": ["coverage/**"] },
    "test:e2e":   { "dependsOn": ["build"], "cache": false },
    "db:generate":{ "cache": false },
    "db:migrate": { "cache": false }
  }
}
```

## 6. Environments

| Env | Branch | DB | URL |
|---|---|---|---|
| local | any | Docker Postgres 17 | `localhost:3000/3001/4000` |
| preview | PR | shared preview DB, per-PR tenant seed | Vercel preview URLs |
| staging | `develop` | dedicated | `staging.ilm.pk` |
| production | `main` | dedicated + PITR | `ilm.pk` |

Production deploys are **manually approved**, always. This product moves money.

## 7. Conventions

- **Files:** `kebab-case.ts`. React components `PascalCase.tsx`. Tests `*.spec.ts` (unit) / `*.e2e-spec.ts`.
- **Branches:** `feat/fees-voucher-generation`, `fix/attendance-timezone`, `chore/…`.
- **Commits:** Conventional Commits with a scope — `feat(fees): idempotent monthly voucher run`.
- **PRs:** one module or one vertical slice. If the diff touches four modules, it is four PRs.
- **DB:** tables `snake_case` plural; Prisma models `PascalCase` singular with `@@map`.
- **Enums:** Postgres enums for closed sets that rarely change (`voucher_status`); lookup tables for
  anything a school may extend (`expense_categories`).
