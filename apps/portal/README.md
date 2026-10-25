# @ilm/portal — Website & school portal

Single Next.js app serving **two sites** (see `src/proxy.ts`):

| Host | Purpose |
|------|---------|
| Apex (`localhost:3000`) | Marketing (`/welcome`), signup, global login |
| `{slug}.localhost:3000` | Authenticated school ERP |

**Not** a separate `apps/web` — this is the user-facing frontend.

## Dev

```bash
pnpm --filter @ilm/portal dev   # port 3000
```

Requires API at `API_URL` (default `http://localhost:4000`) and matching `APP_DOMAIN`.

## How it talks to the backend

- Browser: same-origin `/api/v1/*` → `src/app/api/v1/[...path]/route.ts` → NestJS.
- Server components: `src/lib/api.ts` (`apiFetch`) forwards cookies + `x-school-slug` in path mode.
- Client mutations: `src/lib/mutate.ts`.

No Prisma, no Server Actions. Types/routes from `@ilm/contracts`.

## Key folders

| Path | Role |
|------|------|
| `src/app/` | Routes (App Router) |
| `src/proxy.ts` | Auth, tenant, session refresh |
| `src/components/` | Feature UI + `app-shell.tsx` |
| `src/lib/` | API, session, navigation, tenant helpers |

Full module status: root **`PROJECT_CONTEXT.md`** § Website Modules.
