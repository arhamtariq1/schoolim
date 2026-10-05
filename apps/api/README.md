# @ilm/api — Backend (NestJS)

The **only** application that accesses PostgreSQL via Prisma.

## Dev

```bash
pnpm db                    # from repo root — local Postgres
pnpm --filter @ilm/api dev # port 4000 (via tooling/scripts/dev-api.mjs)
```

Env: copy `apps/api/.env.example` → `apps/api/.env` (or root `.env` per `loadEnv`).

## Layout

| Path | Role |
|------|------|
| `prisma/schema.prisma` | Schema + migrations |
| `prisma/seed.ts` | Dev seed (3 schools + platform user) |
| `src/app.module.ts` | Modules + global guards |
| `src/modules/*` | Feature modules (auth, students, vouchers, …) |
| `src/shared/auth/` | JWT, guards, platform vs tenant |
| `src/shared/tenancy/` | CLS, tenant guard, Prisma extension |
| `src/shared/rbac/` | `@RequirePermission` |
| `src/e2e/` | Integration tests (behavioral spec) |

## Guard chain (order)

`RateLimitGuard` → `AuthGuard` → `TenantGuard` → `PlatformGuard` → `RbacGuard`

Public routes: `@Public()` on auth/signup endpoints.

## API surface

Path constants: `packages/contracts/src/routes.ts`.

- Tenant API: `/api/v1/...`
- Platform API: `/api/v1/platform/...`

Frontends never import this package’s Prisma client.

Details: root **`PROJECT_CONTEXT.md`** § Backend Modules & API Architecture.
