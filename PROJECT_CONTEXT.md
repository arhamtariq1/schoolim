# Lemma — Project Context

**Last verified against codebase:** 2026-10-06 (frontend UI/UX pass included)  
**Maintainers:** Update this file when architecture, auth, permissions, schema, major modules, or **frontend shell/theme patterns** change. App-level READMEs (`apps/*/README.md`) are pointers only; **this document is the source of truth.**

Planning specs in `docs/` (especially `docs/09-page-inventory.md`) describe the **target** product (~106 routes). This file describes **what is built and wired today**.

> **Repo naming:** Monorepo package scope `@ilm/*`. User-facing copy uses `BRAND` from `@ilm/utils` (product name deferred). There is **no** `apps/web` — the public site and school portal are both **`apps/portal`** (two hostnames, one Next.js app).

---

## Project Overview

Multi-tenant **school management SaaS** (Pakistan market): students/admissions, fee vouchers and collection, attendance, expenses, staff, school/challan branding. **One PostgreSQL database**, shared schema, **row-level security (RLS)** plus application tenant scoping.

| Area | State |
|------|--------|
| Foundation (auth, tenancy, guards, contracts, UI kit, CI) | ✅ Implemented |
| School portal features | 🟡 Strong P1–P2 slice, not full doc inventory |
| Platform admin | 🟡 Login + school list/create only |
| Sellable SaaS (billing, trial enforcement, MFA, impersonation) | ⚪ Mostly not built (Phase 5) |

**Non-negotiable:** No `if (schoolId === '…')` — see `CLAUDE.md`, `docs/12-engineering-rules.md`.

**Doc drift:** Root `README.md` still claims “Phase 0, no features” — **incorrect** vs code.

---

## Turborepo Structure

### Workspace (`pnpm-workspace.yaml`)

```
apps/*
packages/*
tooling/*
```

### Applications

| Path | Package name | Role | Default dev port |
|------|----------------|------|------------------|
| `apps/portal` | `@ilm/portal` | **Website + school portal** (apex marketing/signup/login + `{slug}` tenant app) | 3000 |
| `apps/admin` | `@ilm/admin` | **Platform console** (operator/super-admin) | 3001 |
| `apps/api` | `@ilm/api` | **Backend** — only app with Prisma/DB access | 4000 |

There is no separate `apps/web` or `apps/docs` app in the repo today.

### Shared packages

| Path | Package | Consumed by |
|------|---------|-------------|
| `packages/contracts` | `@ilm/contracts` | api, portal, admin — **ROUTES**, permissions, Zod schemas |
| `packages/ui` | `@ilm/ui` | portal, admin — design system |
| `packages/utils` | `@ilm/utils` | api, portal, admin, ui — money, dates, `BRAND`, slug/host |
| `packages/config` | `@ilm/config` | all — ESLint, TS, Tailwind presets |

Database layer: **`apps/api/prisma/`** (not a separate `@ilm/db` package).

### Tooling (not Turbo “apps”)

| Path | Purpose |
|------|---------|
| `tooling/scripts/local-db.mjs` | Embedded Postgres for local dev (`pnpm db`) |
| `tooling/scripts/verify-*.mjs` | Isolation, browser flows, platform, path mode |
| `tooling/scripts/dev-api.mjs` | API dev entry |
| `tooling/sql/01-app-role.sql` | `ilm_app` role bootstrap |

### Root orchestration

| File | Purpose |
|------|---------|
| `package.json` | `pnpm dev`, `build`, `verify:all`, `prisma:*`, `db` |
| `turbo.json` | Tasks: `build`, `dev`, `lint`, `typecheck`, `test`; global env keys |
| `.env.example` | Shared env template (root); apps have `apps/*/.env.example` |
| `.github/workflows/ci.yml` | Lint, typecheck, test, build, RLS checks on Postgres 17 |
| `CLAUDE.md` | House rules for all contributors |

**Lock file:** pnpm (`packageManager`: `pnpm@10.23.0` in root `package.json`).

---

## Applications

### Website (`apps/portal`)

**Not a separate marketing repo.** One Next.js 16 app serves:

- **Apex** (`localhost:3000` / production apex): `/welcome` (landing), `/signup`, `/login` — no tenant.
- **School host** (`{slug}.localhost:3000`): authenticated ERP UI.

**Key mechanics**

| Concern | Implementation |
|---------|----------------|
| Host vs tenant | `apps/portal/src/proxy.ts` |
| Path tenant mode | `apps/portal/src/lib/tenant-mode.ts`, `docs/SINGLE-HOST-MODE.md` |
| Session refresh | `proxy.ts` + `apps/portal/src/lib/refresh.ts` |
| API from browser | Same-origin `/api/v1/*` → `apps/portal/src/app/api/v1/[...path]/route.ts` |
| API from RSC | `apps/portal/src/lib/api.ts` (`apiFetch`) |
| Client mutations | `apps/portal/src/lib/mutate.ts` → `/api/v1/...` |
| Shell / nav | `app-shell.tsx`, `navigation.ts` (permission-filtered) |
| No Server Actions | No `'use server'` in apps |

**Routes (pages):** ~48 `page.tsx` files under `apps/portal/src/app/` — see § Website Modules.

**State management:** React `useState` + RSC data fetch; `@tanstack/react-query` in `package.json` but **unused** in source.

---

### Admin (`apps/admin`)

Minimal **platform console** — separate cookies (`ilm_pat` / `ilm_prt`), separate JWT type.

| Route | Status |
|-------|--------|
| `/` | Redirect → `/login` or `/schools` |
| `/login` | ✅ Platform login form |
| `/schools` | ✅ List schools (server `apiFetch`) |
| `/schools/new` | ✅ Create school |

**API:** Server `apps/admin/src/lib/api.ts` → `API_URL` + platform cookies. Browser can use `/api/v1/[...path]/route.ts` proxy (same pattern as portal).

**Missing vs `docs/modules/super-admin.md`:** Dashboard, subscriptions, impersonation, MFA UI, metering, health.

---

### Backend/API (`apps/api`)

NestJS 11 + Fastify. Modules in `apps/api/src/app.module.ts`:

`Auth`, `Public`, `Students`, `Academics`, `Fees`, `Vouchers`, `Attendance`, `Expenses`, `Staff`, `Schools`, `Profile`, `Platform`, `Health`, `SharedModule`.

**Guard chain (order matters):** `RateLimitGuard` → `AuthGuard` → `TenantGuard` → `PlatformGuard` → `RbacGuard`.

**Permissions:** `@RequirePermission('module.resource.action')` from `apps/api/src/shared/rbac/rbac.guard.ts` on tenant routes.

**Platform:** `@PlatformRoute()` + `@RequiresPlatform('schools.read' | 'schools.create')` on `platform.controller.ts`.

**Cross-cutting:** `AuditInterceptor`, `AllExceptionsFilter` (problem+json), pino logging, Zod via nestjs-zod / manual parse at boundaries.

**Background jobs:** Voucher generation uses `JobRun` + transactional batches in-process — **no Redis/BullMQ** yet.

**E2e tests (behavioral spec):** `apps/api/src/e2e/*.e2e.test.ts` — auth, signup, vouchers, admission, attendance, expenses, promotions, etc.

---

## Shared Packages

### `@ilm/contracts` (`packages/contracts`)

- `src/routes.ts` — **all API path constants** + `COOKIES`, `API_PREFIX`, `PLATFORM_PREFIX`
- `src/permissions.ts`, `src/roles.ts` — RBAC union + matrix
- Domain Zod modules: `auth`, `signup`, `students`, `academics`, `fees`, `vouchers`, `attendance`, `expenses`, `staff`, `platform`, …
- **Must not import Prisma**

### `@ilm/ui` (`packages/ui`)

Radix + Tailwind components: `Button`, `Input`, `DataTable`, `Money`, `DateDisplay`, `Dialog`, `Toast`, `CommandPalette`, etc. Icons: `@ilm/ui/icons` (Lucide re-exports).

### `@ilm/utils` (`packages/utils`)

Money (paisa), dates, `BRAND`, `schoolSlugFromHost`, test clock, etc.

### `@ilm/config` (`packages/config`)

ESLint (`eslint-plugin-boundaries`), Prettier, TypeScript bases, Tailwind theme.

### Duplication (do not refactor yet)

- `apiFetch` in portal vs admin (admin omits tenant header — intentional)
- Some pages use `AppShell` directly vs `SchoolShell` wrapper
- Permission checks repeated in page props (`canCollect`, etc.) alongside API enforcement

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Runtime | Node ≥ 22.18 |
| Monorepo | Turborepo + pnpm 10 |
| API | NestJS 11, Fastify |
| ORM | Prisma 7 → `apps/api/src/prisma/generated` |
| DB | PostgreSQL + RLS (`ilm_app` application role) |
| Frontends | Next.js 16, React 19, Tailwind v4 |
| Validation | Zod 4 (`@ilm/contracts`) |
| Auth | jose + argon2id, httpOnly cookies (**no Google OAuth**) |
| Mail | nodemailer; `MAIL_DRIVER=log` default |
| Storage | Database blobs and/or Cloudinary (`STORAGE_DRIVER`) |

---

## Architecture

```
                    ┌─────────────────┐
                    │  apps/portal    │  apex + {slug} hosts
                    │  (Next.js)      │
                    └────────┬────────┘
                             │ /api/v1 proxy + cookies
                    ┌────────┴────────┐
                    │   apps/admin    │  platform host
                    │   (Next.js)     │
                    └────────┬────────┘
                             │ /api/v1/platform/* + platform cookies
                             ▼
                    ┌─────────────────┐
                    │    apps/api     │  NestJS + guards + CLS tenant
                    │    (Fastify)    │
                    └────────┬────────┘
                             │ Prisma (tenant extension)
                             ▼
                    ┌─────────────────┐
                    │   PostgreSQL    │  RLS tenant_isolation
                    └─────────────────┘
```

**Communication rules**

1. Frontends **never** import Prisma.
2. All business logic and authorization live in **API services**.
3. Browser calls **same-origin** `/api/v1` so session cookies stay first-party.
4. Tenant slug from **Host** (subdomain) or **path + `ilm_school` cookie**; API validates slug against JWT `sid`.

---

## Authentication Flow

| Step | Portal UI | API | DB |
|------|-----------|-----|-----|
| School login | `login-form.tsx` → `ROUTES.auth.login` | `AuthController.login` → `AuthService.login` | `User`, `Session` |
| Apex login | Same form | `globalLogin` → handoff choices | `AuthHandoff` |
| Handoff | `auth/continue/route.ts` | `auth/continue` | Session cookies on school host |
| Signup | `signup-credentials-form.tsx` | `public/signup/start` | `SignupIntent` |
| Signup OTP | `otp-verification-form.tsx` | `signup/verify-otp` | Creates `School`, `User`, `UserRole`, `SchoolAgreement`; handoff |
| Onboarding | `onboarding-form.tsx` | `PUT me/onboarding` | Updates school + `profileCompletedAt` |
| Forgot password | `forgot-password-form.tsx` + OTP | `forgot-password`, `verify-otp`, `reset-password` | `PasswordReset` |
| Email verify | `verify-email/route.ts` | `auth/verify-email` | `EmailVerification` |
| Invite | `accept-invite-form.tsx` | `invite/check`, `invite/accept` | `Invitation` |
| Refresh | `proxy.ts` | `auth/refresh` | `Session` rotation |
| Platform login | `platform-login-form.tsx` | `platform/auth/login` | `PlatformUser`, `PlatformSession` |

**Google login:** ⚪ Not implemented.

**Protected routes:** `apps/portal/src/proxy.ts` (anonymous allow-list, profile gate `pc` claim). API: `AuthGuard` + `@Public()` on auth/signup endpoints.

**Trace example (signup → first screen):**  
`/signup` → `signup/start` → OTP page → `verify-otp` → `signup.service.provisionAfterOtp` → handoff URL → `/auth/continue` sets cookies → redirect `/profile/create` → `me/onboarding` → `profileCompleted` → `/` with `SchoolShell`.

---

## Roles & Permissions

**School roles:** `OWNER`, `PRINCIPAL`, `ADMIN`, `ACCOUNTANT`, `RECEPTION`, `TEACHER`, `COORDINATOR`, `STUDENT`, `PARENT` — grants in `packages/contracts/src/roles.ts`.

**Platform roles:** `SUPER_ADMIN`, `SUPPORT`, `BILLING` — `platform_users.role`; capabilities e.g. `schools.read`, `schools.create` in platform session.

**Enforcement**

- API: `RbacGuard` + `@RequirePermission(...)` on tenant controllers.
- UI: `visibleNavItems(permissions)` in `navigation.ts` — **UX only**.

**Platform → Schools → Users → Roles**

- `School` is tenant root; `User.schoolId` + `UserRole` (role enum, optional scope JSON).
- Platform users are **not** in `users`; they use `platform_users`.

---

## First-Time School Setup

1. Self-serve: signup + OTP → provisional school (`"{name}'s School"`, auto slug) + OWNER.
2. Handoff to `{slug}.<domain>/profile/create`.
3. `OnboardingForm`: school name, slug (live availability), city, phones, logo → `me/onboarding` sets `onboardedAt`, `profileCompletedAt`.
4. Invited staff: `/invite?token=` → password → login (profile may still apply per user flags).

Legacy `POST public/signup/complete` and `/signup/school` are deprecated/redirect only.

---

## Database Architecture

**Schema:** `apps/api/prisma/schema.prisma`  
**Migrations:** `apps/api/prisma/migrations/`  
**Seed (dev):** `apps/api/prisma/seed.ts` — 3 schools, platform user, sample data (refuses `NODE_ENV=production`).

### Model groups (38 models)

| Group | Models |
|-------|--------|
| Platform | `PlatformUser`, `PlatformSession`, `SignupIntent` |
| Tenant core | `School`, `SchoolGroup`, `SchoolDomain`, `User`, `UserRole`, `Session` |
| Auth artifacts | `Invitation`, `PasswordReset`, `AuthHandoff`, `EmailVerification`, `SchoolAgreement` |
| Audit | `AuditLog` |
| Academic | `AcademicSession`, `ClassLevel`, `Section`, `Student`, `Guardian`, `StudentGuardian`, `Enrollment`, `Staff`, `Holiday` |
| Fees | `FeeHead`, `StudentFee`, `FeeVoucher*`, `FeePayment*`, `SecurityDeposit*`, `NumberSequence`, `JobRun` |
| Ops | `AttendanceRecord`, `StaffAttendanceRecord`, `ExpenseCategory`, `Expense`, `SchoolLogo`, `SchoolVoucherSettings` |

**Fee model note:** Implemented as **fee heads + per-student `StudentFee`**, not doc-spec class `fee_plans` with `months[]`.

**Multi-tenant isolation:** `school_id` on tenant tables, RLS policies, Prisma tenant extension, CLS — verified by `pnpm verify:isolation` (also run in CI).

---

## API Architecture

**Base:** `/api/v1`  
**Platform:** `/api/v1/platform/*` (tenant JWT rejected)

### API map — Portal (website) → backend

| Portal feature | Contract routes (`ROUTES.*`) | API module |
|----------------|------------------------------|------------|
| Login / session / password / invite / verify | `auth.*` | `auth` |
| Signup | `public.signup*` | `public` |
| Students / admission / profile 360 | `students.*`, `guardians` | `students` |
| Sessions, classes, holidays, promote | `academics.*` | `academics` |
| Fee heads, late fee | `fees.heads`, `fees.lateFeePolicy` | `fees` |
| Vouchers, generate, pay, challans | `vouchers.*` | `vouchers` |
| Defaulters, increments, deposits | `defaulters`, `feeIncrements`, `securityDeposits` | `fees` |
| Attendance | `attendance.*` | `attendance` |
| Expenses | `expenses.*` | `expenses` |
| Staff | `staff.*` | `staff` |
| School settings, logos, voucher settings | `school.*`, `schoolLogo`, `bankLogo` | `schools` |
| Profile / onboarding | `me.profile`, `me.onboarding` | `profile` |

### API map — Admin → backend

| Admin feature | Routes | API |
|---------------|--------|-----|
| Login / session | `platform.auth.*` | `platform` |
| List / create schools | `platform.schools.*` | `platform` |

---

## Website Modules (`apps/portal`)

Status legend: ✅ Completed · 🟡 Partial · 🎨 UI/mock · ⚪ Missing · 🔴 Broken (none confirmed without runtime QA)

| Module | Status | Key paths |
|--------|--------|-----------|
| Landing / pricing | 🟡 | `app/welcome/page.tsx` — placeholder pricing (D2) |
| Signup + OTP | ✅ | `signup/`, `otp-verification/`, `signup-credentials-form.tsx` |
| Login / handoff | ✅ | `login/`, `auth/continue/route.ts` |
| Forgot / reset | ✅ | `forgot-password/`, `new-password/`, OTP context |
| Home dashboard | 🎨 | `app/page.tsx` — zeros, no API |
| Profile / onboarding | ✅ | `profile/create`, `onboarding-form.tsx` |
| Students list / admit / 360 | 🟡 | `students/*`, `student-profile-view.tsx` |
| Academics | ✅ | `classes/`, `academics/sessions`, `holidays`, `promote` |
| Fees | ✅ | vouchers, generate, defaulters, increments, deposits, print |
| Collect payment | 🟡 | Dialog in `vouchers-view.tsx` only |
| Attendance | ✅ | mark + reports |
| Finance | ✅ | expenses + expense-types |
| Staff | 🟡 | list only; invite via API |
| Settings | 🟡 | school, fees, voucher — no users/roles |
| Requests | 🎨 | `requests/page.tsx` — empty state |
| ⌘K search | 🟡 | `app-search.tsx` — pages + students |
| Google auth | ⚪ | — |

---

## Admin Modules (`apps/admin`)

| Module | Status | Paths |
|--------|--------|-------|
| Auth | ✅ | `login/`, `platform-login-form.tsx` |
| Schools list | ✅ | `schools/page.tsx` |
| Create school | ✅ | `schools/new/`, `create-school-form.tsx` |
| Dashboard / stats | ⚪ | — |
| Subscriptions / billing | ⚪ | — |
| Users / impersonation | ⚪ | — |
| MFA | ⚪ | Schema only on `PlatformUser` |

---

## Backend Modules (`apps/api`)

| Module | Status | Location |
|--------|--------|----------|
| Auth + handoff + email verify + password reset | ✅ | `modules/auth/` |
| Public signup | ✅ | `modules/public/` |
| Students + guardians | ✅ | `modules/students/` |
| Academics + promotions | ✅ | `modules/academics/` |
| Fee heads / policy | ✅ | `modules/fees/` |
| Vouchers + generation + payments on voucher | ✅ | `modules/vouchers/` |
| Defaulters / increments / deposits | ✅ | `modules/fees/*.controller.ts` |
| Attendance | ✅ | `modules/attendance/` |
| Expenses | ✅ | `modules/expenses/` |
| Staff + invite | ✅ | `modules/staff/` |
| School settings / logos / voucher settings | ✅ | `modules/schools/` |
| Profile / onboarding | ✅ | `modules/profile/` |
| Platform auth + schools | 🟡 | `modules/platform/` |
| Subscriptions / webhooks / jobs queue | ⚪ | — |
| Google OAuth | ⚪ | — |

---

## Shared Components

See `packages/ui/src/` and portal `apps/portal/src/components/` — `AppShell`, `SchoolShell`, domain views (`vouchers-view`, `generate-fee`, `students-table`, …).

Portal libs: `api.ts`, `mutate.ts`, `session.ts`, `navigation.ts`, `tenant-mode.ts`, `use-tenant-href.ts`.

---

## External Integrations

| Integration | Purpose | Config (names only) |
|-------------|---------|---------------------|
| PostgreSQL | Primary data store | `DATABASE_URL`, `DATABASE_ADMIN_URL` |
| SMTP / Mailpit | OTP, verify, invite email | `MAIL_DRIVER`, `SMTP_*`, `MAIL_FROM` |
| Cloudinary | Optional public CDN storage | `STORAGE_DRIVER`, `CLOUDINARY_*`, `CLOUDINARY_FOLDER` |
| (none) | Payments, SMS, WhatsApp, Google | — |

---

## Environment Variables

Document **names and purpose only** — never commit secrets.

| Variable | Used by | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | API | App role connection (RLS) |
| `DATABASE_ADMIN_URL` | API, migrations, seed | Owner role |
| `JWT_ACCESS_SECRET` | API | Sign access JWTs |
| `JWT_ACCESS_TTL` | API | Access token lifetime |
| `REFRESH_TOKEN_TTL_DAYS` | API | Refresh session lifetime |
| `API_URL` | portal, admin | Server-side fetch target |
| `API_PORT` | API | Listen port |
| `WEB_URL` | API | Links in emails/handoffs |
| `APP_DOMAIN` | portal, admin, API | Subdomain tenant resolution |
| `NEXT_PUBLIC_APP_DOMAIN` | portal (client) | Signup slug preview |
| `PORTAL_TENANT_MODE` / `NEXT_PUBLIC_PORTAL_TENANT_MODE` | API / portal | `subdomain` vs `path` |
| `COOKIE_DOMAIN` | API | Usually unset (host-only cookies) |
| `MAIL_DRIVER`, `SMTP_*`, `MAIL_FROM` | API | Outbound mail |
| `STORAGE_DRIVER`, `CLOUDINARY_*` | API | File storage |
| `LOG_LEVEL` | API | Pino level |
| `NODE_ENV` | All | Environment |

Templates: `.env.example`, `apps/api/.env.example`, `apps/portal/.env.example`.

---

## Completed Features

- Turborepo + shared packages + boundary linting
- RLS + tenant Prisma extension + isolation verification
- Full school auth (login, handoff, signup OTP provision, password reset OTP, invite, email verify)
- Profile onboarding gate
- Students CRUD + admission + guardian linking + profile API
- Academics structure + holidays + **session promotion** (recent git focus)
- Fee heads, vouchers (preview/generate/pay/edit/print/bulk), defaulters, increments, security deposits, challan settings
- Attendance mark + reports
- Expenses + categories
- Staff list + invite accept flow
- School branding (logo, colour, settings, voucher/bank layout)
- Platform: login, list/create schools
- Storage port + Cloudinary driver (recent)

---

## Partially Completed Features

- Student 360 (missing fees/attendance/timeline tabs from spec)
- Home / role dashboards
- Fee collection UX (in-voucher dialog vs dedicated counter)
- Job run history / reversal UI (backend has `JobRun`)
- Payment list / reverse
- Staff detail & create wizard pages
- Settings: users, roles, audit
- Command palette (no voucher search)
- Platform console (schools only)
- CSRF (cookie/header wired; API guard not found)

---

## UI-Only / Mock Features

- Home dashboard tiles (`app/page.tsx`)
- `/requests` empty state
- Welcome page pricing figures (placeholder)
- Default mail driver logs instead of sending

---

## Missing Features

Google OAuth; admissions pipeline; bulk import; guardians module pages; subjects/timetable; exams; comms/parent portal; payments/day book/reconciliation UI; subscriptions/trial dunning; platform MFA/impersonation/metering; class-level fee plans per long spec; select-role workspace switcher; BullMQ/Redis jobs.

---

## Known Bugs

- Not exhaustively runtime-tested in this documentation pass — run `pnpm verify:all` locally.
- Uncommitted change: `tooling/scripts/dev-api.mjs` (4 lines) per `git diff`.
- Historical fixes in git: print handoff double-mount, challan layout, OTP UX — see recent commits.

---

## Technical Debt

- Root README / `docs/14` / `docs/20` lag implementation
- Unused `@tanstack/react-query` in portal
- Deprecated `signupComplete` API still present
- Duplicate `apiFetch` patterns portal vs admin
- Long spec (106 pages) vs ~48 implemented routes — easy to over-assume

---

## Security Concerns

**Good:** RLS + tenant extension; separate platform auth; host-only cookies; rate limits on auth; argon2id; timing-safe dummy hash on login; refresh reuse detection (documented in auth layer).

**Review:** CSRF not enforced on API; proxy decodes JWT `pc` without verify (redirect only); platform MFA columns unused; trial/suspension not automated; ensure `COOKIE_DOMAIN` stays unset in multi-tenant production.

---

## Multi-Tenant / Data Isolation

- **Platform** tables: no `school_id`; app role has no grant where designed.
- **Tenant** rows: `school_id` NOT NULL, RLS `tenant_isolation`, indexes lead with `school_id`.
- **Request path:** JWT carries school id; `TenantGuard` matches host/header slug; Prisma extension injects `where: { schoolId }`.
- **Cross-tenant:** Tests in CI + `verify:isolation.mjs`; API returns 404 for cross-tenant ids (not 403).

---

## Important Files

| File | Why |
|------|-----|
| `CLAUDE.md` | Non-negotiables |
| `packages/contracts/src/routes.ts` | All API paths + cookies |
| `packages/contracts/src/roles.ts` | Permission matrix |
| `apps/portal/src/proxy.ts` | Auth gating + refresh |
| `apps/portal/src/app/api/v1/[...path]/route.ts` | Browser → API |
| `apps/api/src/app.module.ts` | Guard order |
| `apps/api/src/shared/tenancy/` | Tenant resolution |
| `apps/api/src/shared/rbac/rbac.guard.ts` | `@RequirePermission` |
| `apps/api/prisma/schema.prisma` | Data model |
| `apps/api/src/modules/public/signup.service.ts` | Signup → school creation |
| `apps/api/src/modules/vouchers/voucher-generation.service.ts` | Fee generation |
| `tooling/scripts/verify-isolation.mjs` | Tenant safety net |

---

## Frontend UI/UX (Website + Admin)

**Binding rules:** `docs/16-ui-principles.md` (how to build) and `docs/10-ux-and-design-system.md` (product UX). **Read both before changing any screen.**

### Apps (frontend)

| App | Path | UI role |
|-----|------|---------|
| **Website + school portal** | `apps/portal` | Marketing (`/welcome`), auth screens, full ERP chrome |
| **Platform admin** | `apps/admin` | Bare pages, no shared app shell yet |
| **Design system** | `packages/ui` | All shared components — **never** add a second component library per app |
| **Tokens / Tailwind** | `packages/config/tailwind/theme.css` | Semantic colors, dark mode, brand CSS variables |

There is no separate `apps/web`.

### Theme & global CSS

- **Tokens:** Semantic only (`bg-background`, `text-foreground`, `text-danger`, …) — no raw hex in feature code.
- **Portal** `apps/portal/src/app/globals.css`: imports theme + `@source` for `packages/ui` and portal TSX; **print rules** for fee challan (`.voucher-challan`, `.print-stack`, `@media print`).
- **Portal root layout** `apps/portal/src/app/layout.tsx`: `ToastProvider`, **light-by-default** theme with blocking inline script (`THEME_STORAGE_KEY`), optional **dark** via `theme-toggle.tsx`, `viewport.themeColor` fixed light.
- **Per-school brand:** `BrandTheme` in shell applies `school.primaryColor` → CSS variables (`packages/ui/src/lib/brand-theme.ts`).
- **Admin** `apps/admin/src/app/globals.css`: same theme import; **no** `ToastProvider`, **no** theme toggle, `body` uses `min-h-dvh` (differs from portal).

### Layout patterns (portal)

| Pattern | When | File |
|---------|------|------|
| **AuthLayout** | Signed-out: login, signup, OTP, forgot/reset, invite | `components/auth-layout.tsx` (+ slideshow, scroll lock) |
| **AppShell** | Signed-in chrome: sidebar (≤8 items), header, ⌘K, email banner | `components/app-shell.tsx` |
| **SchoolShell** | Preferred wrapper: `requireSchoolSession()` + AppShell props | `components/school-shell.tsx` |
| **PageHeader** | Title + description + actions | `components/page-header.tsx` |
| **Marketing** | Apex landing only | `app/welcome/page.tsx` (custom layout, not AppShell) |
| **Print** | Challan batch print | `app/fees/vouchers/print/page.tsx` (minimal chrome) |

**Inconsistency to respect until refactored screen-by-screen:** Many pages still call **`AppShell` directly** and duplicate session → props wiring; others use **`SchoolShell`** (e.g. `classes/`, `profile/*`, `page.tsx` home). New work should prefer **`SchoolShell` + `PageHeader`** unless the screen is auth or print.

### Navigation & access UI

- Sidebar items: `apps/portal/src/lib/navigation.ts` (`NAV_ITEMS`, `visibleNavItems(permissions)`).
- Icons: **`@ilm/ui/icons`** only (`nav-icons.ts` maps nav icon names → components).
- In-page tabs: `components/tab-links.tsx` (e.g. Finance expenses / expense-types).
- Command palette: `components/app-search.tsx` inside AppShell (pages + student search; vouchers not wired).
- Profile incomplete: nav disabled + proxy redirect to `/profile/create`; extra nav item injected in AppShell.

### Routes (portal) — UI entry points

- **Public:** `/welcome`, `/signup`, `/login`, `/otp-verification`, `/forgot-password`, `/new-password`, `/invite`
- **Core:** `/`, `/profile`, `/profile/create`, `/profile/edit`, `/settings/*`
- **Modules:** `/students`, `/students/new`, `/students/[id]`, `/classes`, `/academics/*`, `/staff`, `/fees/*`, `/attendance/*`, `/finance/*`, `/requests`
- **Proxy / tenant:** `src/proxy.ts` — do not bypass for auth gating when adding routes

Admin routes: `/login`, `/schools`, `/schools/new` only.

### Components & libraries (actual usage vs docs)

| Concern | Spec (`docs/16`) | **Actual in portal today** |
|---------|------------------|----------------------------|
| Components | `@ilm/ui` | ✅ Used widely |
| Icons | `@ilm/ui/icons`, `ICON_SIZE` | ✅ |
| Tables | `<DataTable>` (TanStack Table) | ✅ Lists: students, vouchers, staff, expenses, etc. |
| Forms | React Hook Form + zod | 🟡 **Most forms use `useState` + `safeParse` on `@ilm/contracts` schemas**, not RHF (RHF is in `package.json` but largely unused) |
| Server state | TanStack Query | ⚪ **Not used** in source (dependency present) |
| Toasts | sonner via `useToast` | ✅ Root `ToastProvider` (portal only) |
| Modals | `Dialog`, `ConfirmDialog` | ✅ Feature dialogs (voucher edit, collect, guardians, …) |
| Money / dates | `<Money>`, `<DateDisplay>`, `<DatePicker>` | ✅ Required for money fields |

### API usage (frontend — do not change contracts)

| Context | Read (RSC) | Write (client) |
|---------|------------|----------------|
| Portal | `lib/api.ts` → `apiFetch(ROUTES…)` | `lib/mutate.ts` → `fetch('/api/v1/…')` with credentials |
| Portal browser | Relative `ROUTES.*` paths | Same-origin proxy adds cookies |
| Admin | `apps/admin/src/lib/api.ts` | Forms POST via fetch to `ROUTES.platform.*` (see login/create-school components) |

Session for shell: `getSession()` / `requireSchoolSession()` → `ROUTES.auth.session`. Types from `@ilm/contracts`.

### Auth UI flows (portal only)

1. **Login** → `login-form.tsx` → handoff or `/profile/create` / `/settings/password` / `/`
2. **Signup** → OTP → handoff → **onboarding** `onboarding-form.tsx`
3. **Forgot** → OTP → **new-password-form.tsx**
4. **Invite** → **accept-invite-form.tsx**

No Google sign-in UI.

### Admin UI

- **No AppShell** — plain `main` containers (`schools/page.tsx`).
- **Components:** `platform-login-form.tsx`, `schools-table.tsx`, `create-school-form.tsx`.
- Styling: same tokens, fewer shared layout primitives; **no toasts** at root (errors inline / problem messages).

### Reusable portal components (feature layer)

`apps/portal/src/components/` — prefer reusing before adding new:  
`students-table`, `admission-form`, `student-profile-view`, `vouchers-view`, `generate-fee`, `voucher-edit-dialog`, `voucher-challan`, `challan-print-view`, `classes-manager`, `sessions-manager`, `holidays-manager`, `promote-students`, `attendance-*`, `expenses-view`, `school-settings-form`, `onboarding-form`, `profile-form`, `verify-email-banner`, `tab-links`, `logo-picker`, `brand-colour-card`, etc.

### UI/UX inconsistencies (documented — fix screen-by-screen with product owner)

1. **Shell wiring:** `AppShell` vs `SchoolShell` vs manual session props on the same concern.
2. **Page headers:** Some screens use `PageHeader`; others embed headings in feature components only.
3. **Admin vs portal chrome:** Admin is minimal; do not assume sidebar/header patterns exist there.
4. **Theme:** Portal has dark toggle; admin is light-only layout.
5. **Marketing vs app:** `/welcome` is explicitly “visual design unfinished” in comments — different from signed-in ERP aesthetic.
6. **Stack vs spec:** RHF / TanStack Query / Zustand listed in docs or `package.json` but **not** adopted consistently in feature code.
7. **Home dashboard:** Placeholder tiles — UI shows zeros by design until API exists.
8. **Requests:** Real shell, empty content — looks “broken” unless copy is understood.

### Frontend files to open first (UI work)

1. `docs/16-ui-principles.md`  
2. `packages/config/tailwind/theme.css`  
3. `packages/ui/src/index.ts` + `packages/ui/src/icons.ts`  
4. `apps/portal/src/components/app-shell.tsx`  
5. `apps/portal/src/components/auth-layout.tsx`  
6. `apps/portal/src/lib/navigation.ts`  
7. `apps/portal/src/lib/mutate.ts` + `apps/portal/src/lib/use-tenant-href.ts`  
8. Target screen’s `app/**/page.tsx` + matching `components/*-view.tsx` or `*-form.tsx`

### Screen-by-screen redesign protocol (agreed with owner)

When instructed per screen: read existing page + components + `ROUTES` usage; preserve behavior and API payloads; change markup/styles only unless explicitly asked; use `@ilm/ui` + semantic tokens; match prior updated screens; do **not** change backend or `packages/contracts` without a separate task.

---

## Current Development State

**Recent git history (last ~15 commits):** Student promotion across sessions, challan print/layout fixes, object storage/Cloudinary, OTP verification UX, voucher bulk print/delete, fee preview zoom fix.

**Phase alignment:** Implementation spans **late P0 through P2** with **minimal P5 admin**. Not production-sellable without billing, legal pages, deployment hardening, and trial enforcement.

---

## Recommended Next Development Steps

1. Local smoke: `pnpm db`, migrate, seed, `pnpm verify:all`, manual login → generate voucher → collect → attendance.
2. **Settings → users & roles** (API/RBAC exists; UI missing).
3. **Payments + JobRun UI** (reverse, run history).
4. **Dashboard metrics API** + wire home page.
5. **Platform:** MFA enforcement, then subscriptions/trial.
6. Sync **README.md** with this file after milestones.

---

## Development Notes

- Money: integer **paisa** in TS; `*Minor` suffix; `<Money>` in UI.
- No Server Actions — use `mutate()` client-side or `apiFetch` in RSC.
- E2e tests are the best “does this work?” reference besides manual QA.
- Product UI must not contain hardcoded brand `ilm` — use `BRAND`.
- When adding tenant tables: migration checklist in `CLAUDE.md` (RLS, index, TENANT_MODELS).

---

## Appendix — Top 20 files to read first

1. `PROJECT_CONTEXT.md` (this file)  
2. `CLAUDE.md`  
3. `docs/04-multi-tenancy-and-security.md`  
4. `packages/contracts/src/routes.ts`  
5. `packages/contracts/src/roles.ts`  
6. `apps/portal/src/proxy.ts`  
7. `apps/portal/src/lib/api.ts`  
8. `apps/portal/src/lib/mutate.ts`  
9. `apps/portal/src/lib/navigation.ts`  
10. `apps/portal/src/components/app-shell.tsx`  
11. `apps/portal/src/app/api/v1/[...path]/route.ts`  
12. `apps/api/src/app.module.ts`  
13. `apps/api/src/modules/auth/auth.controller.ts`  
14. `apps/api/src/modules/auth/auth.service.ts`  
15. `apps/api/src/modules/public/signup.service.ts`  
16. `apps/api/src/shared/rbac/rbac.guard.ts`  
17. `apps/api/src/shared/tenancy/tenant.guard.ts`  
18. `apps/api/prisma/schema.prisma`  
19. `apps/api/prisma/seed.ts`  
20. `apps/admin/src/lib/api.ts` + `apps/admin/src/app/schools/page.tsx`
