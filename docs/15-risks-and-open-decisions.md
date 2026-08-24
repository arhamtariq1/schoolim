# 15 — Risks & Open Decisions

## Part A — Risk register

Ordered by expected damage. Each has an owner action, not just a description.

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|:--:|:--:|---|
| R1 | **Cross-tenant data leak** — school A sees school B's students or fees | Low | **Fatal** | Three independent isolation layers (`04`); an automated suite that runs with the app layer disabled; `404` not `403`; quarterly manual review |
| R2 | **Double billing** — a parent charged twice for one month | Medium | **Severe** | `UNIQUE(school_id, student_id, billing_period_id)`; idempotency keys; advisory locks; preview-before-generate; reversible runs |
| R3 | **Money that does not reconcile** — dashboard ≠ report ≠ reality | Medium | **Severe** | 8 enforced invariants; a nightly consistency job; shared metric definitions; immutable financial records |
| R4 | **Scope creep back into a single-school portal** | **High** | Severe | Rule R1 in `12`; feature flags; custom fields; a written "no" policy for anything one school alone wants |
| R5 | **Building for 6+ months and selling nothing** | **High** | Severe | Phase 5 is the deadline; demo tenant at Phase 1; sell during Phase 2 |
| R6 | **Free-tier failure during a live moment** — Supabase paused, Vercel Hobby flagged | Medium | High | See `13` §1. Upgrade triggers are defined in advance, not improvised |
| R7 | **Voucher generation fails silently mid-run** | Medium | High | `job_runs` with a cursor; resumability; a partial-run alert that pages you |
| R8 | **Data migration into the product is too painful, killing deals** | **High** | High | First-class Excel importer with a validation preview, built in Phase 1 |
| R9 | **Support load exceeds one person** | Medium | High | Impersonation + audit + timeline + self-serve configuration + in-product help |
| R10 | **Teacher adoption fails**, so attendance data is worthless | Medium | High | Mobile-first, default-present, offline; measured against a 30-second target with a real teacher |
| R11 | **WhatsApp/SMS costs make a customer unprofitable** | Medium | Medium | `message_log.cost_minor`, per-plan quotas, soft then hard caps — designed in Phase 6, not retrofitted |
| R12 | **Attendance table growth degrades reports** | Medium | Medium | Monthly partitioning from the first migration; nightly summary tables |
| R13 | **Solo-developer bus factor** | **High** | High | Documentation in-repo; ADRs; no undocumented deploy steps; a written runbook for every operational task |
| R14 | **A payment provider integration stalls on commercial terms** | High | Medium | Ship bank-file reconciliation first — it needs no partner. Treat 1BILL as a long-lead item started early and depended on late |
| R15 | **Backups have never been restored** | Medium | **Fatal** | Quarterly timed restore drill, documented. Off-provider secondary dump |
| R16 | **A school demands its data back during a dispute** | Low | High | Self-serve full export at any time. This is also a sales asset |
| R17 | **No published ToS / Privacy Policy / DPA when the first school asks** | **High** | High | `17` §3. Drafted and reviewed **before** the first paying school, not after. Versioned acceptance in `school_agreements`, because a PDF in a drive proves nothing two years later |
| R18 | **Business registration lead time blocks invoicing** — a sellable product with no legal way to take money | Medium | High | `19` §1. Entity, NTN, sales-tax registration and business bank account take 2–6 weeks of mostly waiting. **Start during Phase 2**, not Phase 5 |
| R19 | **The first real incident is handled ad hoc**, and a school finds out from a parent | **High** | High | `18`. Severity table, first-ten-minutes checklist, runbooks rehearsed at every phase boundary, status page live before the first paying school |
| R20 | **Platform-operator access is unaccounted for** — you can read every child's record and nothing structurally stops you | Low | **Severe** | `17` §5 + `04` §6. Audit write in the same transaction as the token; the **school** sees its own impersonation history; mandatory 2FA; export rate-limited and alerted; monthly self-review |
| R21 | **Withholding tax breaks invoice reconciliation** — schools that paid in full look unpaid | Medium | Medium | `19` §3. Model `gross / salesTax / withholding / received / writeOff` in minor units and settle by invariant, never by `received == gross` |

### The four that deserve daily attention
**R1** and **R2** are existential and technical — the architecture already addresses them, so the job
is to keep the tests green. **R4** and **R5** are existential and behavioural — no architecture
protects you from saying yes to the wrong feature or from postponing the first sale. Those two are
where the last portal actually failed.

---

## Part B — Decisions already made

Recorded so they are not re-litigated in month four.

| Decision | Choice | Where |
|---|---|---|
| Multi-tenancy | Shared schema + `school_id` + RLS | `04` §1, ADR-0002 |
| Auth | Own it in NestJS; Supabase is Postgres only | `04` §4, ADR-0003 |
| ORM | Prisma, for the tenant-scoping extension | `05` §2, ADR-0004 |
| API style | REST + shared zod contracts (not tRPC, not GraphQL) | `11`, ADR-0005 |
| Two frontends | Separate `web` and `admin` apps | `03` §2 |
| Monorepo | Turborepo + pnpm | `06`, ADR-0001 |
| Money | Integer minor units in code, `numeric(14,2)` in DB | `12` R3 |
| Jobs | External cron → `@nestjs/schedule` → BullMQ | `03` §7, ADR-0006 |
| Attendance | Partitioned monthly from day one | `07` §8 |
| Rendering | RSC shells + TanStack Query for grids | `03` §5 |
| Design system | shadcn/ui forked into `@ilm/ui` | `05` §3 |
| Payments v1 | Manual + bank-file reconciliation; gateways in v2 | `02` §3 |
| **Database host** | **Supabase now (Postgres only), migrate to Railway Postgres at Phase 5** | `13` §3, ADR-0003 |
| **Existing data** | **None. Greenfield — no migration from the old portal** | Decided 2026-08-25 |
| **Retention & erasure** | Per data class; per-student erasure anonymises, never deletes | `17` §4 |
| **Operator access** | Exceptional, never silent, read-only by default, time-boxed, reviewed | `17` §5, `04` §6 |
| **Breach notification** | 72 hours to affected schools, contractually, regardless of statute | `17` §6 |
| **Uptime commitment** | Target 99.5%, stated **without** penalty clauses in v1 | `17` §3.1, `18` §8 |

---

## Part C — Open decisions (need your input)

These change the work materially. Everything else in these documents can proceed without them.

**Status as of 2026-08-25.** Four were resolved or deliberately deferred; none blocks Phase 0.

| | Decision | Status |
|---|---|---|
| **D1** | API hosting | **Open — blocks only the P0 *deploy*, not the build.** Decide by the end of Phase 0. Database is settled: Supabase now → Railway at P5. |
| **D2** | Pricing model | **Deferred by decision.** Needed before Phase 5 exit. The schema supports all three; see `19` §5 for the cost floor you cannot price below. |
| **D3** | First customer | **Resolved: new schools.** There is no existing data and no school to migrate — greenfield. R4 (scope creep) is correspondingly easier to hold. |
| **D4** | Product name & domain | **Deferred — under research.** `ilm` remains the placeholder. See the containment rule below. |
| **D5** | Urdu / RTL timing | Open. Recommendation stands: English-only v1, infrastructure wired in P0 either way. |
| **D6** | Family voucher grouping | Open. Recommendation stands: per-student in v1. |

> **D4 containment rule.** Because the name is deferred but the build is not, the placeholder must
> stay renameable by one find-and-replace. `ilm` may appear **only** in: the npm scope (`@ilm/*`),
> the cookie prefix, the local database name, and the Docker container names. It must **never** be
> hard-coded in UI copy, email templates, PDF templates, or the seeded message templates — those
> read from a single `BRAND` constant in `@ilm/utils`. Enforced by a CI grep.

### D1 — API hosting for Phase 0 *(blocks the first deploy, not the build)*
The API wants an always-on process (`13` §1, Fact 3).
- **(a)** Hetzner CX22, ~€4/month — recommended; removes cold starts, real cron, real queues
- **(b)** Oracle Cloud Always Free — genuinely $0, more setup friction, region-dependent capacity
- **(c)** Vercel functions — simplest, but you will fight the limitations from Phase 2 onward
- **(d)** Render/Fly free — fine for development, cold starts make demos awkward

### D2 — Pricing model *(shapes the super-admin schema, needed by Phase 5)*
- **(a)** Flat tiers with a student cap, billed annually — recommended; avoids monthly headcount arguments
- **(b)** Per-student per-month — scales with value, invites disputes
- **(c)** Per-term billing — matches how schools think about money here

The schema in `07` §1 supports all three; you only need to choose which to *ship*.

### D3 — First customer strategy *(shapes Phase 1–2 priorities)*
- **(a)** Migrate your existing school onto the new product — a real reference and real feedback, but
  they will pull you toward their old requirements. Rule R1 becomes hard to hold.
- **(b)** Start with 2–3 new small schools — cleaner product, slower first revenue.
- **(c)** Both, with your existing school explicitly on the standard product and no custom work.

### D4 — Product name and domain *(needed before Phase 1; cheap now, expensive later)*
"Ilm" is a placeholder used throughout these docs. It appears in package names, cookie prefixes and
the database name. Decide before Phase 1 begins.

### D5 — Urdu / RTL timing
- **(a)** English-only v1, Urdu in v2 — recommended; the infrastructure (`next-intl`, logical CSS
  properties) is wired in Phase 0 either way so the retrofit is cheap
- **(b)** Bilingual from day one — a real differentiator for smaller schools, roughly 15% extra effort
  across every screen

### D6 — Family voucher grouping
Should siblings receive one combined voucher or one per student?
Schools genuinely differ. **Recommendation: build per-student in v1 and make combined a Phase 6
setting** — combined vouchers complicate allocation, part payments and reconciliation significantly,
and doing it badly early would violate several invariants.

---

## Part D — Explicit non-goals

Write these down so that saying no is a policy rather than an argument.

- No LMS (courses, video, quizzes) — a different product with a different buyer
- No custom reports built by you as a service — build the report builder instead
- No on-premise deployments
- No per-school custom code, at any price, in any form
- No double-entry general ledger in v1 — the schema is designed to allow one later
- No auto-generated timetable in v1
- No native mobile app until the PWA is proven insufficient
- No support for schools outside Pakistan until the Pakistani product is winning
