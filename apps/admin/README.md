# @ilm/admin — Platform console

Operator-facing app for **platform staff** (super-admin/support/billing). Separate from the school portal:

- Different hostname in production (`admin.<domain>`).
- Different cookies: `ilm_pat` / `ilm_prt` (`COOKIES` in `@ilm/contracts`).
- API namespace: `/api/v1/platform/*` only.

## Dev

```bash
pnpm --filter @ilm/admin dev   # port 3001
```

## Implemented routes

- `/login` — platform sign-in
- `/schools` — list tenants
- `/schools/new` — create school

Root `/` redirects to login or schools.

## Backend access

- RSC: `src/lib/api.ts` → `API_URL` with platform session cookies.
- Optional browser proxy: `src/app/api/v1/[...path]/route.ts` (same pattern as portal).

## Dependencies

`@ilm/contracts`, `@ilm/ui`, `@ilm/utils` — no `@ilm/ui` domain tables; no database.

Details: root **`PROJECT_CONTEXT.md`** § Admin Modules.
