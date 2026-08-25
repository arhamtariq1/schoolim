# 00 — START HERE

**A 20-minute read of the entire plan.** Everything below is expanded elsewhere; nothing below is
optional. Read this once, make the three decisions at the end, then start Phase 0.

---

## 1. The answer to your question

**Yes.** This works as a SaaS, technically and commercially.

- 500 students × 12 monthly vouchers = 6,000 rows per school per year. 100 schools = 600k rows in
  your largest billing table. PostgreSQL does not notice this.
- Attendance is the only real volume driver: ~100k rows per school per year, ~10M across 100
  schools. Handled by partitioning that table by month **from the first migration**.
- You do not need sharding, microservices, or Kafka. You need one well-indexed database and
  disciplined tenant scoping.

**The hard parts are not technical.** They are: selling to schools (they buy from people they meet),
support load as school count grows, and Excel data import being painful enough to lose deals.

---

## 2. Why the last portal failed, and the one rule that prevents it

It failed because **one school's requirements became code**. Requirement → custom feature →
exception → another branch → unmaintainable.

> **The rule: there is no `if (schoolId === '...')` in this codebase. Ever.**

A school-specific requirement resolves to exactly one of three things:

1. **Configuration** — a setting, a fee-plan shape, a template, a custom field
2. **A feature flag** — in `school_features`, so other schools can opt in later
3. **Declined** — and if they insist, it becomes a generalised paid feature on the roadmap

Four mechanisms make this possible instead of aspirational:

| Mechanism                                                | What it absorbs                                         |
| -------------------------------------------------------- | ------------------------------------------------------- |
| `fee_plans` with a `months[]` array                      | "Our exam fee is only charged in April and November"    |
| `custom_field_defs` + a `custom jsonb` column            | "We need to store the father's employer"                |
| `request_types` with a JSON form schema + approval chain | "We need a bus-route change request with two approvers" |
| `school_features` flags                                  | "We want the transport module, they don't"              |

---

## 3. Architecture in six lines

```
apps/portal  Next.js 16   School portal, multi-tenant, {slug}.<domain>
apps/admin   Next.js 16   Super admin, yours only, admin.<domain>
apps/api     NestJS 11    The only thing that touches the database
packages/contracts        zod schemas shared by all three — one source of truth for types
packages/{ui,db,utils}    design system, Prisma, money/date helpers
PostgreSQL                one database, shared schema, row-level security
```

**Two frontend apps, not one.** Blast radius: a privilege-escalation bug in the school portal cannot
reach super-admin capability, because platform routes reject any token whose type is not `platform`.

**A real API, not just server actions.** You need batch jobs, cron, bank webhooks, a future mobile
app, and one place where tenancy and permissions are enforced. Spreading that across server actions
is how the last portal became unmaintainable.

---

## 4. Tenant isolation — the one thing that must not break

Everything else is recoverable. A cross-tenant leak ends the company. So it is enforced **three
times**, each layer written assuming the other two are broken:

| Layer                  | Mechanism                                                                                                                                                      | Fails how                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **L1** Request context | `nestjs-cls` AsyncLocalStorage. The guard checks the JWT claim **and** the host; a mismatch is a 401. No function ever takes `schoolId` as a parameter.        | Closed — throws               |
| **L2** Query scoping   | A Prisma client extension injects `where: { schoolId }` into every read and stamps it on every write. Developers cannot forget it because they never write it. | Closed — throws if no context |
| **L3** Database        | PostgreSQL RLS. The app connects as a role without `BYPASSRLS`. Blocks even raw SQL and injection.                                                             | Closed — returns nothing      |

**Proven on every PR:** a test suite seeds two schools and asserts School A cannot list, read,
update or delete a single School B row — then repeats it with **L2 disabled**, proving RLS holds
alone. A new table without `school_id`, an RLS policy, a `school_id`-leading index, and model
registration fails CI.

Cross-tenant reads return **404, never 403** — a 403 confirms the record exists.

---

## 5. The stack, and the four decisions inside it

| Layer      | Choice                                            | The deciding reason                                                                                    |
| ---------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Monorepo   | Turborepo + **pnpm**                              | pnpm's strict `node_modules` stops phantom dependencies — how monorepos rot                            |
| API        | NestJS 11 on **Fastify**                          | Guards + DI make tenancy, RBAC and audit framework concerns, not copy-paste                            |
| ORM        | **Prisma 7**                                      | Client extensions give one interception point for tenant scoping. Alone outweighs Drizzle's nicer SQL. |
| Validation | **zod 4** + nestjs-zod                            | One schema serves the API, the forms and the OpenAPI spec                                              |
| Apps       | Next.js 16 + React 19                             | RSC shells + **TanStack Query** for the filter-heavy grids staff live in                               |
| UI         | Tailwind v4 + **shadcn/ui** forked into `@ilm/ui` | Per-school branding becomes a CSS-variable swap, not a rebuild                                         |
| Auth       | **Own it** — jose + argon2id                      | Supabase Auth would make your planned migration mean re-authenticating every user at every school      |
| PDF        | **@react-pdf/renderer**                           | No browser binary; voucher templates become versioned React components                                 |
| Tests      | Vitest + **Testcontainers**                       | A real Postgres per run — a mocked DB would never catch the RLS bugs that matter                       |

**One version decision for Phase 0:** `typescript@latest` is now 7.0.2 (the native Go compiler), but
NestJS leans on legacy decorators and `emitDecoratorMetadata` — historically where the native port
lags. Build the API on TS 5.9, spike TS 7 separately; the Next apps can take TS 7 now.

---

## 6. Your sidebar is the product's biggest UX problem

Your screenshot shows ~30 destinations in one flat list, identical for a teacher and an owner,
ordered by database table. Configuration ("Fee Settings", "Expense Type") sits beside hourly work
("Mark Attendance"). Nothing signals urgency.

**The fix is three tiers:**

1. **Sidebar, max 8 items**, generated from permissions — granting a permission reveals the menu
   item automatically, so the two can never drift. A teacher sees 5. An owner sees 8.
2. **In-page tabs.** "Fee Voucher / Defaulter List / Generate Fee" become tabs and actions inside
   Fees. Roughly half the old sidebar moves into **Settings**.
3. **Command palette (⌘K)** — searches students, vouchers, receipts _and actions_.

**And eight home screens, not one dashboard with eight permission checks:**

| Role              | Opens to                                                                               |
| ----------------- | -------------------------------------------------------------------------------------- |
| Owner / Principal | Collection vs last month, ageing buckets, pending-approvals inbox                      |
| Admin             | A task queue: incomplete admissions, unassigned fee plans, attendance not marked       |
| Accountant        | Today's cash, generation status, defaulter worklist sorted by impact                   |
| Reception         | One large search box, and a fee-collection flow targeting **20 seconds keyboard-only** |
| Teacher           | Today's timetable with unmarked periods red — on a phone, offline tolerant             |
| Parent / Student  | One voucher card, attendance calendar, results                                         |

---

## 7. The fee engine — this is the product

Four configurable layers. A voucher is their **materialisation, frozen at generation time**, so
changing a fee plan never retroactively changes an issued voucher. That single rule kills the
largest category of support call.

```
WHAT      fee_heads        Tuition, Transport, Exam, Admission, Security Deposit
HOW MUCH  fee_plans        per class per session, lines with months[] and due day
EXCEPTION overrides, discounts, waivers    per student, with approvals
WHEN      billing_periods + generation runs
```

**Generation, in order:** acquire an advisory lock on (school, period) → upsert a run by idempotency
key (a completed run returns its old result and does nothing) → process 200 students per transaction
with a persisted cursor → insert `ON CONFLICT DO NOTHING` against
`UNIQUE(school_id, student_id, billing_period_id)`.

**That unique constraint is the single most important line in the schema.** The database, not your
code, is what prevents double-billing.

**Preview before generate** — nobody else in this market has it. Before one row is written: how many
vouchers, how many skipped and why, gross vs discounts vs arrears vs net, comparison to last period
with the drivers named, a sample voucher rendered exactly as it will print, and warnings for
students with no fee plan. Same code path as generation, not a separate estimate.

**A run stays reversible** while every voucher in it is unpaid. That is how an accountant recovers
from a wrong due date without calling you.

**Money:** `numeric(14,2)` in Postgres, **integer paisa in code**, every field suffixed `Minor`.
Never a float. Financial records are append-only — corrections are reversing entries, never edits.

---

## 8. Hosting — three facts that change your plan

Your plan (NestJS + Supabase, all on Vercel, migrate to Railway later) is **mostly right**. Three
verified facts:

| #   | Fact                                                                               | What it means                                                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Vercel Hobby forbids commercial use**                                            | The moment one school pays you — even by bank transfer — you are outside its terms. Pro is $20/mo. Hobby is fine for dev and demos; budget the upgrade.                                                             |
| 2   | **Supabase Free pauses a project after 7 idle days** (plus 500 MB, 60 connections) | Not the storage — the _pause_. A paused project means nobody can collect a fee. Supabase Free is a **development database**.                                                                                        |
| 3   | **NestJS on Vercel is the wrong shape**                                            | It deploys and works. But Hobby cron fires once/day at best, there are no persistent queue workers, cold starts hit the school opening at 7:50am, and generating 1,000 vouchers must be chunked across invocations. |

**Recommendation: spend about $5/month.** A Hetzner CX22 (~€4/mo) runs the API, Postgres, Redis and
a reverse proxy with no cold starts, real cron and real queues, while the Next.js apps stay on
Vercel where they belong. If the budget must be exactly zero, **Oracle Cloud Always Free** is the
strongest free option — Render's free tier spins down after 15 minutes, which makes demos awkward.

**The Supabase migration is already de-risked** because Supabase is used _only_ as PostgreSQL and
object storage — no Auth, no client SDK, no Realtime. The migration is a `pg_dump` and a
connection-string swap. **Rehearse it in Phase 1**, long before a client exists, to prove
portability.

---

## 9. The phase plan

**The deadline that matters is Phase 5, not Phase 9.**

| Phase  | What                                                                                              | Weeks   | Exit criteria                                                       |
| ------ | ------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------- |
| **P0** | Foundation: monorepo, tenancy, auth, RBAC, audit, CI. No features.                                | 2–3     | School A provably cannot read one School B row — _with L2 disabled_ |
| **P1** | Sessions, structure, students, staff, DataTable engine, Excel import, rollover, demo tenant       | 3–4     | You can run a credible sales demo. **Start selling here.**          |
| **P2** | Fee engine: plans, discounts, preview→generate→reverse, voucher PDF, counter payments, defaulters | 4–5     | A real accountant runs a full month and finds nothing wrong         |
| **P3** | Attendance: mobile-first, offline, leaves, partitioning, reports                                  | 2       | A real teacher marks 40 students on their phone in under 30 seconds |
| **P4** | Finance, day-book, reconciliation, all 8 role workspaces, BullMQ                                  | 3       | Dashboard number and report number come from the same query         |
| **P5** | **Super admin, subscriptions, metering, impersonation, Postgres migration, security review**      | 2–3     | A school onboarded in 10 min. **Three pilot schools paying.**       |
| P6     | Requests/approvals, WhatsApp, bulk messaging, parent PWA                                          | 3       |                                                                     |
| P7     | Exams, marks, report cards, basic payroll                                                         | 3       |                                                                     |
| P8     | Payments: bank-file import first, then Raast QR, then checkout                                    | 3       |                                                                     |
| P9     | Scale, report builder, Urdu/RTL, multi-branch                                                     | ongoing |                                                                     |

**Rules:** phase order is not negotiable · no phase starts before the previous one's exit criteria
are met · **sell during Phase 2, not after Phase 8** · budget 20% of every phase for polish.

**After Phase 5, stop and sell for a month.** What three real schools teach you will change the
priority of everything below it.

---

## 10. The market you are entering

Real and occupied — which is a good sign, and the incumbents are beatable on product quality.

**Student Care** (a 1LINK joint venture, 1,100+ schools, 560k+ parents) · **EduSuite** (JazzCash,
EasyPaisa, SadaPay, QuickPay, HBL + WhatsApp) · **Skoolways** · **TaleemPro** · **PakEduSystem**.

**Table stakes (you cannot win without these):** fee vouchers, defaulter tracking, WhatsApp/SMS
reminders, digital receipts, attendance, parent visibility.

**Your wedge:** staff UX (they are all dense desktop-only admin grids — exactly your screenshot) ·
self-serve configuration (most competitors configure fee structures _for_ you — a services business
dressed as SaaS) · reporting that answers questions · money numbers that reconcile.

**Do not try to beat Student Care on 1BILL in v1.** They are literally a 1LINK joint venture. Ship
**bank collection-file reconciliation** first — highest ROI, needs no commercial partner.

---

## 11. The four risks that actually matter

| Risk                                             | Type                         | Guard                                                                               |
| ------------------------------------------------ | ---------------------------- | ----------------------------------------------------------------------------------- |
| Cross-tenant leak                                | Existential, **technical**   | Three layers + a suite that runs on every PR. Solved by design; just keep it green. |
| Double billing                                   | Existential, **technical**   | Unique constraint + idempotency keys + advisory locks. Solved by design.            |
| **Scope creep back into a single-school portal** | Existential, **behavioural** | Only your discipline. No architecture protects you here.                            |
| **Six months of building, nothing sold**         | Existential, **behavioural** | Demo at end of P1. Sell during P2. Phase 5 is the deadline.                         |

The first two are handled. **The last two are where the previous portal actually failed.**

---

## 12. The decisions — settled and outstanding

**Settled as of 2026-08-25** (full record in `15` Part B):

|                    |                                                                                                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Database**       | Supabase now, used as **plain Postgres only** → migrate to Railway Postgres at Phase 5 (`13` §3)                                                                                                    |
| **Existing data**  | **None.** Greenfield — nothing migrates from the old portal                                                                                                                                         |
| **First customer** | New schools. There is no school to migrate, so the no-custom-code rule starts easy                                                                                                                  |
| **Name & domain**  | **Deferred, under research.** `ilm` is a placeholder confined to the npm scope, cookie prefix, local DB name and container names — never in UI copy or templates (D4 containment rule, `15` Part C) |
| **Pricing**        | **Deferred.** Needed before Phase 5 exit; know the cost floor in `19` §5 first                                                                                                                      |

**Still open — one blocks a deploy, none blocks the build:**

### D1 — Where does the API run? _(blocks the first *deploy*, decide by end of Phase 0)_

Hetzner ~€4/mo · Oracle Cloud Always Free ($0) · Vercel functions · Render/Fly (dev only).
**Recommendation: Hetzner.** Do not spend month one fighting free-tier ergonomics.

### D5 — Urdu / RTL timing · D6 — Family voucher grouping

Both have standing recommendations in `15` Part C. Neither affects Phase 0.

### And one thing with a lead time you cannot compress

**Company registration, NTN, sales-tax registration and a business bank account take 2–6 weeks of
waiting** (`19` §1). Start during Phase 2. A sellable product with no legal way to invoice is the
avoidable version of R5.

---

## 13. Where to go next

| When                                         | Read                                                                                                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Now**                                      | `15-risks-and-open-decisions.md` (full decision list), `14-roadmap-and-phases.md` (per-phase checklists)                                                                  |
| **Before writing code**                      | `04-multi-tenancy-and-security.md`, `12-engineering-rules.md`, `06-repo-structure.md`                                                                                     |
| **Keep open while coding**                   | `/CLAUDE.md` — the ten non-negotiables on one page                                                                                                                        |
| **Phase 1**                                  | `07-data-model.md`, `modules/core-academic.md`, `modules/reporting.md`, `08-rbac-and-roles.md`, `10-ux-and-design-system.md`                                              |
| **Phase 2**                                  | `modules/fees-and-finance.md` — the most important module spec in the set · **`19-business-operations.md` — start the company/bank registration now, it takes 2–6 weeks** |
| **Before the first paying school**           | `17-legal-and-compliance.md` (ToS, Privacy Policy, DPA, operator-access policy) · `18-incident-response-and-operations.md` (status page, runbooks)                        |
| **When something breaks**                    | `18-incident-response-and-operations.md` — severity table and the first ten minutes                                                                                       |
| **When you wonder "why did we decide that"** | `adr/`                                                                                                                                                                    |
