# 01 — Vision & Scope

## 1. The problem we are solving

Pakistani private schools (100–2,000 students) run on a mix of registers, Excel, WhatsApp and
whichever local software vendor sold them a licence. The recurring pain, in order of how much it hurts:

1. **Fee collection.** Every month someone manually produces 500 vouchers, chases defaulters,
   reconciles bank slips, and argues with parents about what was actually paid.
2. **Attendance.** Paper registers that nobody aggregates until a parent complains.
3. **Money visibility.** The principal cannot answer "how much did we collect this month vs. last"
   without asking the accountant to spend two days in Excel.
4. **Staff churn.** The one person who "knows the system" leaves.

Notice that 1, 3 and 4 are all financial-trust problems. **This product is a school finance
system with an academic system attached, not the other way around.** That framing drives every
prioritisation call in this repository.

## 2. What we are building

One product, two surfaces:

### 2.1 School Portal (`apps/web`)
Multi-tenant. Every school gets an isolated workspace at `{slug}.domain.com` (or `/s/{slug}` in
Phase 0). Users inside a school: **Owner, Principal, Admin, Accountant, Reception, Teacher,
Student, Parent**. Each role gets a *task-oriented workspace*, not a shared 20-item sidebar.

### 2.2 Super Admin Console (`apps/admin`)
Single-tenant, operated only by you (and later, support staff). Onboard schools, manage plans and
subscriptions, impersonate for support (audited), watch platform health, run migrations and
feature flags, see revenue.

These are **two Next.js applications** sharing one design system and one API. They are not
"one app with a role check", because super-admin capability must never be reachable from the
tenant application surface, even in the presence of a bug.

## 3. Product principles

| # | Principle | Consequence in code |
|---|---|---|
| P1 | **Configuration over customisation** | Fee rules, grading schemes, voucher layouts, workflows are rows in tables, not code branches |
| P2 | **The database is the last line of defence** | RLS is on even though the app also scopes queries |
| P3 | **Money operations are immutable and auditable** | No hard deletes on financial records; corrections are reversing entries |
| P4 | **Idempotency everywhere batch runs exist** | Re-running the September voucher job must never double-bill |
| P5 | **Every role has a purpose-built home screen** | We ship 8 dashboards, not 1 dashboard with 8 permission checks |
| P6 | **Mobile-first where the work happens on a phone** | Teacher attendance, parent voucher view |
| P7 | **Bulk by default** | Any operation a school does for one student, they will need for 500 |
| P8 | **Nothing school-specific ships** | If only one school wants it, it becomes a feature flag or it is declined |

## 4. Scope: in / out

### In scope — v1 (sellable product)
- Multi-tenant school workspaces with subdomain routing
- Auth, RBAC, invitations, per-tenant branding
- Academic structure: sessions, classes, sections, subjects, timetable slots
- Admissions pipeline → student records → guardian records
- Staff records with basic HR (designation, joining, salary head — payroll is Phase 7)
- **Fee engine**: heads, plans, per-student assignment, discounts, waivers, increments,
  security deposit, monthly voucher generation, part payments, defaulters, receipts
- Attendance: student daily/period, staff, leave, reports
- Finance: revenue, expense, expense categories, day-book, basic P&L view
- Requests/approvals workflow (leave, correction, transfer certificate, refund)
- Reports & exports (PDF/Excel) for every list in the product
- Notifications: in-app + email; WhatsApp/SMS behind an adapter
- Super admin: schools, plans, subscriptions, usage, impersonation, audit
- Full audit log on every mutating action

### In scope — v1.1 → v2
- Exams, marks entry, grading schemes, report cards
- Payment gateway integration (1BILL / Raast QR / JazzCash / EasyPaisa)
- Parent mobile PWA
- Payroll
- Transport, hostel, library, inventory
- Urdu localisation + RTL

### Explicitly out of scope (say no, on purpose)
- Learning management (courses, video, quizzes). Different product, different buyer.
- Custom per-school reports built by us as a service. Give them a report builder instead.
- On-premise installs.
- Accounting-grade double-entry general ledger in v1. We do a clean cash-book with categories,
  and design the schema so a real GL can be layered on later (see `docs/modules/fees-and-finance.md`).

## 5. Success criteria

**Technical (end of Phase 5):**
- A new school is onboarded end-to-end in under 10 minutes with zero engineering involvement.
- Monthly voucher generation for 1,000 students completes in under 60 seconds and is safely re-runnable.
- Zero cross-tenant data access in an automated RLS test suite that runs on every PR.
- p95 API latency < 300 ms for list endpoints at 50 concurrent users.

**Commercial:**
- 3 paying pilot schools before writing the exams module.
- Churn driver #1 (fee reconciliation friction) measurably lower than the incumbent workflow —
  measured as "days from voucher issue to payment recorded".

## 6. Naming

Codename in docs: **Ilm**. Change it once, in one place, before Phase 1 —
package names, DB name and cookie prefixes all derive from it.
