# 03 — System Architecture

## 1. High-level shape

```
                          ┌──────────────────────────────────────┐
   {slug}.ilm.pk  ──────▶ │  apps/web    (Next.js 16, App Router) │
                          │  School Portal — multi-tenant         │
                          │  8 role workspaces, RSC + client isles│
                          └──────────────┬───────────────────────┘
                                         │  HTTPS, httpOnly cookie session
                          ┌──────────────▼───────────────────────┐
   admin.ilm.pk  ───────▶ │  apps/admin  (Next.js 16)             │
                          │  Super Admin — single tenant, yours   │
                          └──────────────┬───────────────────────┘
                                         │
                          ┌──────────────▼───────────────────────┐
                          │  apps/api    (NestJS 11)              │
                          │  ┌─────────────────────────────────┐  │
                          │  │ HTTP layer: controllers, DTOs   │  │
                          │  │ Guards: Auth → Tenant → RBAC    │  │
                          │  ├─────────────────────────────────┤  │
                          │  │ Domain modules (see §3)         │  │
                          │  │ Services hold the business rules│  │
                          │  ├─────────────────────────────────┤  │
                          │  │ Data layer: Prisma + tenant ext │  │
                          │  └─────────────────────────────────┘  │
                          └───┬──────────────┬───────────────┬────┘
                              │              │               │
                   ┌──────────▼───┐  ┌───────▼──────┐  ┌─────▼────────┐
                   │ PostgreSQL   │  │ Object store │  │ Job runner   │
                   │ shared schema│  │ docs, photos │  │ cron → BullMQ│
                   │ + RLS        │  │              │  │ (Phase 4+)   │
                   └──────────────┘  └──────────────┘  └──────────────┘
                              │
                   ┌──────────▼──────────────────────────────┐
                   │ Outbound adapters (ports, swappable)    │
                   │ Email · WhatsApp · SMS · Payments · PDF │
                   └─────────────────────────────────────────┘
```

## 2. Why this shape

**Why a separate NestJS API instead of Next.js route handlers / server actions only?**
Because a school portal is not a website. You need long-running batch jobs, scheduled work, webhook
endpoints from banks, a stable versioned API for a future mobile app, and — most importantly — one
place where tenant isolation and RBAC are enforced. Spreading that logic across server actions is
exactly how the previous portal became unmaintainable.

**Why two Next apps and not one?** Blast radius. `apps/admin` talks to `/api/v1/platform/*`
endpoints that are unreachable with a tenant session. A privilege-escalation bug in the school
portal cannot reach super-admin capability, because those routes reject any token whose
`type !== "platform"`.

**Why a monorepo?** One TypeScript type flows from Prisma schema → zod contract → NestJS DTO →
React Query hook → form. Renaming a field breaks the build in the right place. For a small team this
is the single biggest maintainability lever available.

**Why not tRPC?** We want a public, documented, versioned REST API — schools will ask for
integrations, a mobile app is coming, and bank webhooks are REST. We get tRPC-class type safety
anyway from a shared zod contract package; see `11-api-conventions.md`.

**Why no microservices?** At 100 schools this is one process. Service boundaries now buy nothing and
cost everything. Build a modular monolith with strict module boundaries; if a module ever must be
extracted, its seam is already clean.

## 3. Backend module map (`apps/api/src/modules`)

Every module has the same internal shape — see `12-engineering-rules.md` §4.

```
platform/     super-admin only: schools, plans, subscriptions, impersonation, platform audit
identity/     users, sessions, invitations, password reset, MFA (later)
tenancy/      school profile, branding, settings, feature flags, custom field definitions
academics/    sessions, classes, sections, subjects, timetable
people/       students, guardians, enrollments, staff, documents
admissions/   leads, applications, entry tests, offers, conversion to student
fees/         heads, plans, assignments, discounts, vouchers, payments, defaulters
finance/      receipts, expenses, expense categories, day-book, reconciliation
attendance/   student attendance, staff attendance, leaves, holidays
exams/        exam terms, marks, grading schemes, report cards            (v1.1)
workflow/     requests, approvals, transfer certificates
comms/        notification dispatch, templates, channels
reporting/    report definitions, saved views, exports
audit/        append-only audit trail (cross-cutting, write-mostly)
shared/       guards, interceptors, filters, decorators, prisma, cls, config
```

**Dependency rule.** A module may depend on `shared/` and on modules *below it in the declared layer
order*. `fees` may read `people`; `people` must never import `fees`. Cross-module reads go through
the other module's exported service, never through its Prisma models directly. Enforced by
`eslint-plugin-boundaries` in CI, not by good intentions.

Layer order (top may use bottom): `reporting` → `workflow`/`comms` → `fees`/`finance`/`attendance`/`exams` → `admissions` → `people` → `academics` → `tenancy` → `identity` → `shared`.

## 4. Request lifecycle — the critical path

```
1.  apps/web    fetch("/api/v1/fees/vouchers", { credentials: "include" })
                cookie: ilm_at  (access JWT, 15 min, httpOnly, SameSite=Lax, Secure)

2.  Nest        helmet → cors → requestId middleware

3.  AuthGuard   verify JWT signature + exp
                attach { userId, schoolId, roles, type: "tenant" | "platform" }

4.  TenantGuard resolve the school from (a) the JWT claim and (b) the x-school-slug header.
                They MUST match. Mismatch = 401, never a silent redirect.
                Write schoolId into AsyncLocalStorage (nestjs-cls).

5.  RbacGuard   read @RequirePermission("fees.voucher.read"), check the role/permission matrix,
                then check @RequireFeature(...) against the tenant's enabled modules.

6.  ZodPipe     parse params/query/body against the schema in @ilm/contracts.

7.  Controller  thin. Maps request to a service call. Contains no business logic.

8.  Service     business rules, transactions, domain events.

9.  TenantPrisma  opens a transaction, runs SET LOCAL app.current_school_id = $1,
                  AND injects where: { schoolId } through a Prisma client extension.
                  The RLS policy on the table is the third, independent defence.

10. Interceptors  AuditInterceptor (non-GET) → SerializeInterceptor → response envelope

11. Filter        domain errors → RFC 9457 application/problem+json
```

Steps 4 and 9 are the heart of the product. They get their own dedicated test suite that runs on
every PR. See `04-multi-tenancy-and-security.md`.

## 5. Frontend architecture (`apps/web`)

```
src/
  app/
    (public)/                login, forgot-password, accept-invite
    (portal)/
      layout.tsx             shell: sidebar + topbar + command palette
      dashboard/page.tsx     dispatches to the current role's workspace component
      students/ fees/ attendance/ finance/ settings/ ...
    api/                     BFF only: session cookie exchange, file proxy. No business logic.
  features/                  ← the real code lives here, organised by domain not by file type
    fees/
      api/                   typed hooks over the shared contract (useVouchers, useGenerateFees)
      components/            VoucherTable, FeePlanEditor, DefaulterCard
      schemas/               form schemas, re-exported from @ilm/contracts where shared
      utils/
  components/ui/             re-exports from @ilm/ui only — never define primitives here
  lib/                       api client, auth helpers, formatters, permission hooks
  hooks/
```

**Rendering strategy**

- **Server Components** for shells, navigation, and small initial payloads.
- **Client Components + TanStack Query** for every data grid, filter and mutation. School staff live
  in long-lived, filter-heavy screens; a client cache with optimistic updates beats RSC round-trips
  there. Do not fight this.
- **Server Actions** only for auth-adjacent cookie work in the BFF. Business mutations go through
  the API, so RBAC and audit are enforced in exactly one place.

## 6. Multi-tenant routing

| Phase | Scheme | Notes |
|---|---|---|
| 0–1 | `app.ilm.pk/s/{slug}/…` | Zero DNS work; middleware puts the slug in a header |
| 2+ | `{slug}.ilm.pk` | Wildcard DNS + wildcard TLS; middleware rewrites internally to `/s/{slug}` |
| v2 | Custom domain per school | `portal.theirschool.edu.pk` via CNAME; stored in `school_domains` |

`middleware.ts` resolves the tenant slug, verifies that the session's `schoolId` matches, and sets
`x-school-slug` on the upstream request.

## 7. Background work

Three tiers, adopted in this order:

1. **Phase 0–2 — external cron + chunked endpoint.** An authenticated `POST /internal/jobs/{name}`
   called by an external scheduler with a shared secret. Work is chunked (`?cursor=`, returns
   `nextCursor`) so no single invocation approaches the platform timeout.
2. **Phase 3+ — in-process scheduler.** `@nestjs/schedule`, once the API runs on an always-on host.
3. **Phase 4+ — BullMQ + Redis.** Real queues with retries, backoff, dead-letter and a dashboard,
   for voucher generation, bulk messaging, PDF rendering and imports.

**Every job is idempotent and keyed.** A `job_runs` table records
`(name, idempotency_key, status, cursor, stats)`. Re-running a completed run is a no-op that returns
the original result. This is not optional — it is what prevents double-billing.

## 8. Cross-cutting concerns

| Concern | Mechanism |
|---|---|
| Tenant context | `nestjs-cls` AsyncLocalStorage, set in `TenantGuard`, read by `TenantPrisma` and the logger |
| Audit | `AuditInterceptor` on all non-GET routes → append-only `audit_logs`; financial modules also emit domain events |
| Logging | `pino` structured JSON; every line carries `requestId`, `schoolId`, `userId` |
| Errors | Domain error classes → `AllExceptionsFilter` → `application/problem+json` |
| Config | `zod`-validated env at boot; the process refuses to start on an invalid env |
| Feature flags | `school_features` table + `@RequireFeature()` decorator + `useFeature()` hook |
| Files | Presigned upload straight to object storage; the API only issues and validates the grant |
| Time | Stored `timestamptz` in UTC, rendered in the school's timezone (`Asia/Karachi` default). Calendar-only academic dates use `date`. |
| Money | `numeric(14,2)` in Postgres, **integer minor units (paisa) in application code**. Never a JS float, never `Number` arithmetic on rupees. |
| i18n | `next-intl` from day one, even while English-only. Retrofitting RTL Urdu later costs 10× more. |
