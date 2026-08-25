# 02 — Feasibility & Market Reality

## 1. Is this feasible as a SaaS? Yes — with three caveats.

**Yes, technically.** 500 students × 12 monthly vouchers = 6,000 voucher rows per school per year.
100 schools = 600k rows/year in the largest table. PostgreSQL does not notice this. Attendance is
the real volume driver: 500 students × 200 school days = 100k rows/school/year; 100 schools = 10M
rows/year. Still comfortably single-Postgres territory with correct indexing and monthly
partitioning on `attendance` from day one. You do not need sharding, microservices, or Kafka. You
need one well-indexed database and disciplined tenant scoping.

**Yes, commercially.** Recurring, low-churn, budget-holder-approved spend. Schools switch software
rarely, which is bad for acquisition and excellent for retention.

**The three caveats:**

| Caveat                                   | Reality                                                                                                                  | Mitigation                                                                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sales is the hard part, not code**     | Schools buy from people they meet, not from landing pages. Sales cycle 1–3 months, often gated on the principal's trust. | Start with schools you can reach in person. Your existing school is reference #1. Build the demo tenant early (Phase 1) so you can sell while building. |
| **Support cost is real**                 | A non-technical accountant will call you when a voucher looks wrong. Multiply by N schools.                              | Impersonation + audit log + self-serve corrections from day one. Every "call the vendor" workflow is a bug.                                             |
| **Data migration is the buying blocker** | Every school has 500 students in some Excel/legacy DB. If import is painful, you lose the deal.                          | Ship a first-class Excel importer with validation preview in Phase 1, not Phase 8. Treat it as a sales tool.                                            |

## 2. Who you are competing with (Pakistan)

Research shows the market is real and occupied, which is a good sign — but the incumbents are
beatable on product quality.

- **Student Care** (studentcare.pk) — partnership with **1LINK**; 1,100+ schools, 560k+ parents
  since 2016. Their moat is **1BILL integration** (pay a school challan from any Pakistani banking
  app) and **Raast 1GO QR** on the voucher. This is the single most important competitive feature in
  the market.
- **EduSuite** (edusuite.pk) — integrates JazzCash, EasyPaisa, SadaPay, QuickPay, HBL; built-in
  WhatsApp voucher delivery.
- **Skoolways** — SMB-focused: fees, attendance, students, reports, parent comms;
  EasyPaisa/JazzCash/Raast.
- **TaleemPro**, **PakEduSystem** — fee collection, defaulter tracking, WhatsApp reminders, digital
  receipts.

### What every one of them ships (table stakes — you cannot win without these)

Fee vouchers · defaulter tracking · WhatsApp/SMS reminders · digital receipts · attendance · parent
visibility.

### Where they are weak (your wedge)

1. **UX for staff.** Almost all of these are dense, desktop-only, PHP-era admin grids — exactly the
   sidebar in your screenshot. Role-tailored, fast, keyboard-friendly UI is a genuine differentiator
   that a principal _feels_ in a 10-minute demo.
2. **Self-serve configuration.** Most competitors configure fee structures _for_ you (a services
   business dressed as SaaS). A school that can change its own fee plan without a support ticket is
   a school that renews.
3. **Reporting that answers questions.** "Why is collection down 8% this month" — segment by class,
   by fee head, by defaulter age. Incumbents give you a CSV.
4. **Reliability of the money numbers.** Idempotent generation, immutable ledger, full audit. Ask
   any school about their current software and you will hear a double-billing story.

### What you must NOT try to beat them on in v1

**1BILL/1LINK integration.** Student Care is literally a 1LINK joint venture. You will not get
comparable terms early. Plan for it (see §3) but do not let it block v1.

## 3. Payments strategy (Pakistan-specific)

Payment is the highest-value integration and the highest-friction one. Sequence it:

| Stage | Method                                                                                                                            | Effort                           | When         |
| ----- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------ |
| 0     | **Printed voucher + manual bank slip entry** — accountant marks paid, optionally bulk-imports the bank's daily collection Excel   | Low                              | v1 (Phase 2) |
| 1     | **Bank collection-file reconciliation** — school's bank emails a daily settlement file; we parse and auto-match by voucher number | Medium                           | v1.1         |
| 2     | **Raast QR on the voucher** — parent scans with any banking app; requires a PSP/aggregator relationship                           | Medium-High                      | v2           |
| 3     | **PSP checkout** — JazzCash / EasyPaisa / QuickPay hosted checkout, webhook-confirmed                                             | Medium                           | v2           |
| 4     | **1BILL / 1LINK consumer-number** — the gold standard; pay a school challan from any bank app                                     | High (commercial, not technical) | v2+          |

**Architectural consequence:** define a `PaymentProvider` port in Phase 2 with a single `Payment`
domain model and provider-specific adapters + webhook handlers. Stage 0 is just the
`ManualProvider`. Nothing in the fee module ever knows a provider name.

## 4. Pricing model (informs the super-admin schema)

Design the billing schema to support all of these, ship one:

- **Per-student, per-month, tiered** — e.g. PKR 40–80/student/month with volume brackets. This is
  what the market understands and it scales revenue with customer value.
- **Flat plan tiers** (Starter / Standard / Pro) gated by _modules_ and _student caps_.
- **Annual prepay discount** — strongly preferred in this market; improves cash flow and churn.

Recommendation: **flat tiers with a student cap, billed annually or per-term**, because per-student
metering invites monthly arguments about headcount. But store `plan`, `student_cap`,
`enabled_modules[]`, and `billing_cycle` so you can switch without a migration.

## 5. Honest risk assessment

| Risk                                            | Severity     | Note                                                                                                                             |
| ----------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| You build for 6 months and sell nothing         | **High**     | Antidote: Phase 5 (a sellable MVP) is the deadline, not Phase 9. Demo tenant by end of Phase 1.                                  |
| Scope creep back into "portal for one school"   | **High**     | This is what happened last time. Rule P8 + feature flags exist for exactly this.                                                 |
| Free-tier hosting bites you at the worst moment | Medium       | See `docs/13-infrastructure-and-deployment.md` — Supabase free pauses after 7 idle days and Vercel Hobby forbids commercial use. |
| Support load exceeds one person                 | Medium       | Impersonation + audit + self-serve config are the only scalable answers.                                                         |
| A fee bug bills a parent twice                  | **Critical** | Idempotency keys + immutable ledger + reversing entries. Non-negotiable in Phase 2.                                              |

**Sources:** [Student Care](https://www.studentcare.pk/) ·
[EduSuite fee collection guide](https://www.edusuite.pk/blog/online-school-fee-collection/) ·
[Skoolways](https://skoolways.com/) · [1LINK](https://1link.net.pk/) ·
[TaleemPro](https://taleempro.pk/fee-management-system/) ·
[PakEduSystem](https://pakedusystem.pk/fee-management-software)
