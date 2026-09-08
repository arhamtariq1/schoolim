# 14 — Roadmap & Phases

Estimates assume **one focused full-time developer**. Halve the speed if this is
evenings-and-weekends; the _order_ matters far more than the durations.

**The deadline that matters is Phase 5, not Phase 9.** Phase 5 is a sellable product. Everything
after it is expansion. Do not build exams before you have a paying school.

```
P0 Foundation ──▶ P1 Core Academic ──▶ P2 Fees Engine ──▶ P3 Attendance
                                                              │
   ◀────────── SELLABLE MVP ──────────┐                       ▼
                                      └── P5 Super Admin ◀── P4 Finance
                                             │
                                             ▼
                       P6 Comms ──▶ P7 Exams ──▶ P8 Payments ──▶ P9 Scale
```

---

## Phase 0 — Foundation (2–3 weeks)

_Goal: a vertical slice that proves the architecture. No features._

- [x] Turborepo + pnpm; `apps/{api,portal,admin}`; `packages/{contracts,db,ui,utils,config}`
- [x] Shared eslint/prettier/tsconfig/tailwind presets; `eslint-plugin-boundaries` configured
- [x] Local PostgreSQL via `pnpm db` (no Docker — see `15` Part B)
- [x] Prisma schema v0: `schools`, `users`, `user_roles`, `sessions`, `audit_logs`
- [x] **RLS on every table + the migration checklist CI gate**
- [x] CLS tenant context + `TenantPrisma` + the Prisma tenant extension
- [x] Auth: register/login/refresh/logout, argon2, refresh rotation with reuse detection
- [x] `AuthGuard` → `TenantGuard` → `RbacGuard` chain; permission matrix in `@ilm/contracts`
- [x] `AuditInterceptor`; `AllExceptionsFilter` with problem+json; pino logging
- [◐] `@ilm/ui` foundation: tokens, `cn()`, icon vocabulary, Button, StatusBadge, Skeleton,
  `<Money>`, `<DateDisplay>`, and the four required states. **Outstanding: Input, Select, Dialog,
  Table primitives, Toast** — deferred until Phase 1, when there is a real form and a real list to
  shape them against
- [◐] App shell: permission-generated nav **defined**; topbar, command palette and tenant theming
  outstanding
- [ ] Login → dashboard working end to end in `portal` and `admin` _(API side proven by 16 e2e
      tests; the UI is not wired to it yet)_
- [x] CI: lint, typecheck, test, build, **tenant-isolation suite**, secret scan _(written; unproven
      until the first push to a remote)_
- [x] **CI grep gate: no `ilm` outside the npm scope, cookie prefix, DB name and container names**
      (D4 containment rule, `15` Part C) — the brand string lives in one `BRAND` constant
- [◐] `docs/runbooks/` index created; RB-02 (read-only mode) and RB-03 (rollback) written (`18` §3)
- [ ] Deployed: `portal` + `admin` on Vercel, `api` on the chosen always-on host (D1 due here)

**Exit criteria**

- A user logs into School A and provably cannot read a single row of School B — with the Prisma
  extension **disabled**, proving RLS works alone.
- A new tenant-scoped table cannot be merged without RLS, an index and registration.
- CI is green and runs in under 5 minutes.

> Do not move on until the isolation suite is green. Everything after this assumes it.

---

## Phase 1 — Core Academic (3–4 weeks)

_Goal: a school can be set up and populated. The demo tenant exists._

- [ ] Sessions, class levels, sections, subjects, class-subject mapping, holidays
- [ ] **`DataTable` engine**: filters, sorting, columns, saved views, bulk actions, exports
      (`reporting.md`)
- [ ] Students: list, 360 page, admission stepper, status lifecycle
- [ ] Guardians with duplicate detection and sibling linking
- [ ] Enrollments, roll numbers, section assignment and transfer
- [ ] Staff: list, 360, invitations, section assignment driving scoped permissions
- [ ] **Bulk Excel import** with a validation preview grid
- [ ] Custom fields (definitions + `custom jsonb` rendering)
- [ ] **CNIC / B-Form collection is a per-school setting, never a required field** (`17` §2)
- [ ] **Dry-run of the Supabase → Railway migration** (RB-07) — prove portability long before it
      matters
- [ ] Documents upload via presigned URLs
- [ ] Basic timetable grid with clash detection
- [ ] Year rollover wizard
- [ ] **Demo tenant generator** — 300 students with a year of realistic history
- [ ] Settings: school profile, branding, users and roles

**Exit criteria**

- A school is set up from empty to 500 imported students in under 30 minutes.
- Rollover works on the demo tenant.
- You can run a credible sales demo. _Start selling now, while building Phase 2._

---

## Phase 2 — Fees Engine (4–5 weeks) ← the most important phase

_Goal: the money works, provably._

- [ ] Fee heads, fee plans with `months[]`, plan preview panel
- [ ] Student assignment (auto by class, bulk reassign) and per-student overrides
- [ ] Discounts (typed, categorised, stacking rule) with an approval path
- [ ] Waivers as an approval workflow producing voucher lines
- [ ] Fee increments with dry-run preview and rollback
- [ ] Billing periods
- [ ] **Voucher generation: preview → advisory lock → chunked idempotent run → reverse**
- [ ] Voucher list, detail, cancel, timeline
- [ ] **Voucher PDF: 3-copy A4 Pakistani bank layout with school branding and a QR code**
- [ ] Batch print by section
- [ ] Payments: the counter flow, allocation oldest-first, part payments, overpayment credits
- [ ] Receipts with gapless numbering, print and reprint
- [ ] Reversals with reasons; cheque clearing and bounce handling
- [ ] Security deposits with a full lifecycle
- [ ] Defaulter worklist with ageing, reminders and contact history
- [ ] Arrears carry-forward
- [ ] **Financial invariant test suite + the nightly consistency job**
- [ ] RB-04 (partial voucher run) written and rehearsed once on the demo tenant (`18` §3)

**⚖️ Off-keyboard, starts now and runs in parallel — see `19` §1:**

- [ ] Entity chosen · NTN · provincial sales-tax registration · **business bank account** _(2–6
      weeks of waiting — starting this at Phase 5 is how a sellable product sits idle)_
- [ ] One session with a tax practitioner: sales tax by province, withholding, invoice format
- [ ] ToS, Privacy Policy (Urdu + English) and DPA drafted for review (`17` §3)

**Exit criteria**

- Generate → reverse → regenerate on 1,000 students, with zero duplicates, proven by test.
- A payment recorded at the counter in under 20 seconds, keyboard-only.
- All 8 invariants hold under a randomised operation fuzz test.
- A real accountant runs a full month on the demo tenant and finds nothing wrong.

---

## Phase 3 — Attendance (2 weeks)

- [ ] Configuration (mode, statuses, windows, locking, working days)
- [ ] **Mobile-first marking: default-present, one submit, offline queue**
- [ ] Teacher Today screen with unmarked-period badges
- [ ] Staff attendance; leave types, requests, approvals, quota tracking
- [ ] Monthly partitioning + the nightly summary table
- [ ] Reports: daily register, monthly grid, class comparison, chronic absentees, parent view
- [ ] Absence notifications; the weekly unmarked-sections digest to the principal

**Exit criteria:** a real teacher marks a real 40-student section on their own phone in under 30
seconds, including one offline attempt that syncs correctly.

---

## Phase 4 — Finance & Reports (3 weeks)

- [ ] Expense categories, expense entry with attachments, approval thresholds, recurring templates
- [ ] Other income; bank accounts
- [ ] `cash_transactions` day-book fed automatically by payments and expenses
- [ ] Monthly close / fiscal locking with audited unlock
- [ ] Bank reconciliation: statement import, auto-match, manual resolve
- [ ] Reports: collection summary, ageing, head-wise, discount/waiver register, income vs expense
- [ ] **Role workspaces built properly** — all 8 dashboards from `08` §6, using shared metric
      definitions
- [ ] BullMQ + Redis for generation, exports, messaging and PDFs

**Exit criteria:** the principal's dashboard number and the collection report number are produced by
the same query and always agree.

---

## Phase 5 — Super Admin & Subscriptions (2–3 weeks) ← **SELLABLE MVP**

> **Three items below landed early**, with ADR-0010: self-serve signup, the trial that starts with
> it, and `school_agreements`. The agreement record could not wait, because self-serve is precisely
> what removes the operator who could otherwise attest to what a school agreed to. What did **not**
> come forward is everything downstream of the trial — expiry, dunning, invoicing and pricing are
> still Phase 5, and until they land a trial that ends does nothing.

- [ ] `apps/admin` with a separate user table, cookie, guard and mandatory MFA
- [ ] School CRUD; the onboarding wizard with seed defaults
- [x] **Self-serve signup + 30-day trial start** (ADR-0010) — 2026-09-02
- [ ] Plans, subscriptions, invoices, **trial expiry**, dunning, read-only grace mode
- [x] **Verify the owner's email address at signup** (ADR-0012) — 2026-09-02. Sends and records;
      gating trial conversion on it is still this phase's work
- [ ] A registered domain and a real mail provider — Gmail cannot carry Phase 6 (ADR-0011, **D4**)
- [ ] Usage metering (nightly snapshots) and graduated plan-limit enforcement
- [ ] Feature flags: global, per-plan, per-school
- [ ] Impersonation with reason, expiry, banner and dual-sided audit — **the school sees its own
      impersonation history**, export is rate-limited and alerted (`04` §6, `17` §5)
- [ ] Platform health: jobs, errors, queue depth, cross-tenant audit search
- [ ] Subdomain routing (`{slug}.<domain>`) with wildcard TLS — **D4 must be decided before this**
- [ ] Marketing site + pricing page (**D2 due**) + **published ToS / Privacy Policy / DPA** (`17`
      §3)
- [x] **`school_agreements` — versioned acceptance record** (`17` §3, `19` §6) — 2026-09-02
- [ ] `platform_invoices` with `gross / salesTax / withholding / received / writeOff` in minor
      units, settling by invariant (`19` §3) · invoice PDF with NTN and a gapless sequence
- [ ] Support-minutes-per-school tracking (R9)
- [ ] **Status page live on a different host** + WhatsApp broadcast list of school admins (`18` §6)
- [ ] Read-only mode operable per-school **and** platform-wide, and actually tested (RB-02)
- [ ] RB-05 (cross-tenant leak) tabletop · RB-08 and RB-09 written
- [ ] **Migrate off Supabase to Railway Postgres (runbook in `13` §3, RB-07)**
- [ ] Full security review of auth and tenancy by someone who did not write it

**Exit criteria**

- A school is onboarded end to end in under 10 minutes with no engineering involvement.
- **Three pilot schools live and paying** — against signed terms, invoiced from a business account.

> **Stop here and sell for at least a month before starting Phase 6.** What you learn from three
> real schools will change the priority of everything below.

---

## Phase 6 — Communication & Parent Portal (3 weeks)

- [ ] Configurable request types with form schemas and approval chains; the `onApprove` action
      pattern
- [ ] Approvals inbox on every workspace; SLA and escalation
- [ ] Transfer certificate / clearance flow
- [ ] Notification service with channel adapters; templates with preview; Urdu defaults
- [ ] WhatsApp Cloud API integration with a template registry and delivery webhooks
- [ ] SMS aggregator; automated notification rules; per-school toggles
- [ ] Bulk messaging with audience builder, cost estimate and delivery report
- [ ] Cost metering per school, feeding plan quotas
- [ ] **Per-plan message quotas with soft and hard caps — ship _with_ messaging, never retrofitted**
      (R11; messaging is the only variable cost in the business, `19` §5)
- [ ] Message content retention capped at 1 year (`17` §4)
- [ ] Parent/student portal polish + PWA manifest and installability

## Phase 7 — Exams & Results (3 weeks)

- [ ] Exam terms, exams, grading schemes
- [ ] Marks entry grid with paste-from-Excel and progress tracking
- [ ] Result computation, positions (configurable), grades
- [ ] Report card templates, batch generation, explicit publish/unpublish
- [ ] Performance analytics; failing-subject alerts
- [ ] Payroll (basic): salary structure, monthly run, payslips, attendance-linked deductions

## Phase 8 — Payments Integration (3 weeks)

- [ ] `PaymentProvider` port hardening; provider registry per school
- [ ] Bank collection-file import with match preview _(do this first — highest ROI, no partner
      needed)_
- [ ] Raast QR on vouchers
- [ ] JazzCash / EasyPaisa / QuickPay hosted checkout with signed, idempotent webhooks
- [ ] Auto-reconciliation and settlement reports
- [ ] Begin 1BILL / 1LINK commercial conversations (long lead time — start early)

## Phase 9 — Scale & Expansion (ongoing)

- [ ] Performance: read replica, query tuning, caching, partition maintenance
- [ ] **Retention enforcement**: `retention_policies` per school, attendance→summary rollup at 3
      years, `audit_logs` archive to cold storage, document deletion (`17` §4)
- [ ] **Per-student erasure/anonymisation** action, run by the school's own admin (`17` §4)
- [ ] Custom report builder
- [ ] Transport, library, hostel, inventory (each behind a feature flag)
- [ ] Urdu localisation and RTL
- [ ] Native mobile app if the PWA proves insufficient
- [ ] Multi-branch school groups (a `school_groups` layer above `schools`)
- [ ] Public API + webhooks for integrations

---

## Milestones

| Milestone                    | End of | The question it answers                      |
| ---------------------------- | ------ | -------------------------------------------- |
| **M1 — Architecture proven** | P0     | Is the tenancy model correct?                |
| **M2 — Demo-able**           | P1     | Can I show this to a principal?              |
| **M3 — Money works**         | P2     | Would I trust this with a school's fees?     |
| **M4 — Daily-usable**        | P3     | Would a teacher use it every day?            |
| **M5 — Sellable**            | P5     | Can I onboard and charge a school?           |
| **M6 — Competitive**         | P8     | Can I win against Student Care and EduSuite? |

## Working rules for the roadmap

1. **Phase order is not negotiable.** Each phase depends on the previous one's foundations.
2. **No phase starts before the previous one's exit criteria are met.** Partial phases compound.
3. **Sell during Phase 2, not after Phase 8.** Feedback from a real school beats six months of
   guessing.
4. **Every phase ends with a demo to a real school person**, even an informal one.
5. **Budget 20% of every phase for polish and bug-fixing.** Estimates that omit it are fiction.
6. **Every phase boundary runs the same three checks** (`18` §7): rehearse RB-02 (read-only mode),
   RB-03 (rollback) and RB-06 (credential rotation), and clear the security gate in `04` §8. A
   runbook that has never been executed is fiction too.
