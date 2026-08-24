# Module — Fees & Finance (Phases 2 and 4)

> This is the product. Everything else is supporting cast. It is also the only module where a bug
> costs you a customer permanently.

---

## 1. The mental model

Four layers, each configurable, each auditable:

```
  WHAT is charged      →  fee_heads          Tuition, Transport, Exam, Admission, Security Deposit
  HOW MUCH, to WHOM    →  fee_plans          a bundle of heads with amounts, per class per session
  EXCEPTIONS           →  overrides,          per-student amount changes, discounts, waivers
                          discounts, waivers
  WHEN                 →  billing_periods    "September 2026" — open, due 10th, late fee after 15th
                          + generation runs
```

A voucher is the **materialisation** of (student × billing period) against those four layers, frozen
at generation time. Once issued, changing a fee plan does **not** retroactively change issued
vouchers. That single rule eliminates the largest category of "the amount changed by itself"
support calls.

---

## 2. Fee heads

**Screen:** Settings › Fees › Heads

| Field | Notes |
|---|---|
| name, code | "Tuition Fee", `TUITION` |
| type | `RECURRING` · `ONE_TIME` · `REFUNDABLE` (security deposit) |
| default_frequency | `MONTHLY` · `TERM` · `ANNUAL` · `ONCE` |
| gl_category | Maps into the income side of the day-book |
| sort_order | Controls the printed order on the voucher |

Rules: a head in use cannot be deleted, only deactivated. `REFUNDABLE` heads never count as income —
they land in `security_deposits` and in a liability bucket.

---

## 3. Fee plans

**Screen:** Fees › Plans — list, then a plan editor.

A plan is `(session, class level, name)` with lines: `fee_head → amount, frequency, due day, months[]`.

- **`months[]`** is what makes this flexible without code: an exam fee charged only in April and
  November is `months = [4, 11]`. Tuition is all 12 (or the school's session months). Annual charge
  is a single month.
- Plans have `DRAFT → ACTIVE → ARCHIVED`. Only `ACTIVE` plans generate.
- Editing an `ACTIVE` plan asks: *"Apply from which billing period?"* — never silently retroactive.
- **Plan preview:** a live panel showing "a Grade 5 student on this plan pays PKR X in Sept, Y in
  April" and the annual total. Schools get this wrong constantly; show them the answer.

**Assignment:** `student_fee_assignments` links student → plan for a session. Default assignment
happens automatically by class level at admission and at rollover. Bulk reassignment is available
from the student list.

---

## 4. Exceptions

### 4.1 Per-student overrides
`student_fee_overrides`: for one student, one head — a different amount, or waived entirely, with a
reason and an effective date range. Used for the "the principal agreed to PKR 3,000 instead of
5,000" case, which otherwise becomes a cloned plan and then 40 cloned plans.

### 4.2 Discounts
Named, reusable, typed (`PERCENT` | `FIXED`), optionally scoped to one head, categorised
(`SIBLING` · `MERIT` · `STAFF` · `HARDSHIP`). Assigned to a student for a date range.

- **Sibling discount is auto-suggested** when a second child of the same guardian is admitted.
  Suggested, never auto-applied — the school decides.
- Discounts marked `requires_approval` create a `requests` record and do not take effect until
  approved by `OWNER`/`PRINCIPAL`.
- Stacking rule is explicit and configurable per school: `HIGHEST_ONLY` (default) or `ADDITIVE`,
  with a floor of zero. Ambiguity here creates arguments; make it a setting.

### 4.3 Waivers
A waiver applies to an **already-issued voucher** (or a head on it) — "waive September's transport
fee because the bus did not run". It is an approval workflow, it creates a negative line on the
voucher, and it is recorded separately from discounts so the principal can see "how much did we
give away this year, and why".

The old portal had "Fee Waived Off" as a direct edit. That is how numbers stop reconciling.

### 4.4 Fee increments
**Screen:** Fees › Increments — a wizard.

1. Choose scope: all / class level / specific plan / specific head.
2. Choose mode: `PERCENT` or `FIXED`, and the value.
3. Choose effective billing period.
4. **Dry run** → a table showing every affected plan line, old amount → new amount, and the
   projected monthly revenue change. Export it for the board meeting.
5. Apply → updates plan lines, stores the full before/after in `fee_increments.preview`,
   status `APPLIED`.

An applied increment can be **rolled back** as long as no voucher has been generated for the
effective period. After that, it is corrected by a new increment, not by editing history.

---

## 5. Voucher generation — the batch engine

**Screen:** Fees › Generate — a 4-step wizard.

```
Step 1  Period        Session, billing period (Sept 2026), issue date, due date, late-fee date
Step 2  Scope         All students · specific classes · specific sections · a saved view
                      Options: include arrears, apply late fee to overdue, group siblings
Step 3  Preview       ← the step nobody else in this market has
Step 4  Generate      Runs, streams progress, produces a summary
```

### Step 3 — Preview (non-negotiable)
Before a single row is written, show:
- **Count** of vouchers to be created, and count skipped with the reason
  (already generated · student left · no fee plan assigned · session closed)
- **Total amount**: gross, discounts, waivers, arrears, net
- **Comparison to last period**: "+PKR 42,000 (+3.1%) — driven by 8 new admissions and the
  July increment"
- **A sample voucher** rendered exactly as it will print
- **Warnings**: students with no fee plan, students with a negative net, duplicate detection

Preview is a pure function over the same code path as generation. It is not a separate estimate.

### The generation algorithm

```
POST /fees/generation-runs   { billingPeriodId, scope, options, idempotencyKey }

1. Acquire an advisory lock on (school_id, billing_period_id).
   Concurrent generation for the same period is impossible, not merely unlikely.

2. Upsert fee_generation_runs by idempotency_key.
   If a COMPLETED run exists → return its result. No work, no duplicates.

3. Resolve the student set (scope + status=ACTIVE + enrolled in session).

4. For each chunk of 200 students, in its own transaction:
     a. Load plan lines applicable to (student, period.month)
     b. Apply overrides → discounts (per stacking rule) → clamp at zero
     c. Compute arrears = sum(balance of unpaid vouchers) if options.includeArrears
     d. Compute late fee if applicable
     e. INSERT voucher + lines
        ON CONFLICT (school_id, student_id, billing_period_id) DO NOTHING
        ← the database, not the code, is what guarantees no double-billing
     f. Increment run counters, persist cursor

5. Mark COMPLETED. Emit FeeVouchersGenerated. Return the summary.
```

**Performance target:** 1,000 students in under 60 s, in 200-row chunks, resumable from `cursor`
after any crash or timeout. At 500 students this is a few seconds.

### Reversal
A run can be reversed while **every** voucher in it is unpaid: deletes those vouchers, marks the run
`ROLLED_BACK`, writes an audit entry. If any voucher has a payment, reversal is refused and the user
is directed to cancel individual vouchers instead. This is the escape hatch that lets an accountant
recover from "I generated with the wrong due date" without calling you.

---

## 6. The voucher itself

**Screen:** Fees › Vouchers (list) → Voucher detail

- Voucher list = the shared DataTable. Filters: period, class/section, status, ageing bucket,
  amount range, payment method. Bulk: print, download PDF, send via WhatsApp/SMS/email, cancel.
- **Voucher detail** shows lines, the payment history, the audit timeline, and every action
  (record payment, waive, cancel, reprint, send).

### Printing
- Templates as React-PDF components, versioned in the repo, with per-school branding
  (logo, colours, header, footer, bank details, terms).
- Standard Pakistani layout: **three copies on one A4** — Bank Copy / School Copy / Parent Copy —
  because this is what banks accept.
- Barcode/QR of the voucher number so counter staff scan instead of typing.
- Batch print produces one PDF for a whole class, sorted by roll number.

### Delivery
- WhatsApp (highest engagement in this market), SMS fallback, email, plus in-portal.
- Bulk send with a preview of the message and the count, cost estimate, and per-recipient status
  in `message_log`.

---

## 7. Payments

### The counter flow (optimise this above everything else)
`RECEPTION` opens **Collect Fee**:
1. Search (name / admission no / phone / voucher no / scan QR) → student card
2. Outstanding vouchers listed oldest-first, pre-ticked
3. Amount defaults to the total; editable for part payment
4. Method: Cash · Bank · Cheque · Online, plus reference
5. **Enter** → payment recorded, receipt printed, voucher status updated

Target: **under 20 seconds, keyboard-only, no mouse.** Print happens automatically.

### Rules
- **Allocation is oldest-first by default** across outstanding vouchers, manually overridable.
  `payment_allocations` records exactly which voucher got which rupee.
- Part payments are first-class: voucher → `PARTIALLY_PAID`, balance tracked, next voucher can carry
  the arrear.
- **Overpayment** creates a `student_credits` entry auto-applied to the next voucher. Never a
  negative balance.
- Every payment carries an `idempotency_key`; a double-submitted form creates one payment.
- A payment is **never edited or deleted**. Corrections create a reversal payment with
  `status = REVERSED` and a link, plus a mandatory reason. The receipt number is retained.
- Cheques: `PENDING` until cleared; a bounced cheque reverses the allocation and (optionally,
  per school setting) adds a bounce charge.

### Bank/gateway ingestion (v1.1 → v2)
- `PaymentProvider` port with adapters. v1 ships `ManualProvider` only.
- **Bank collection file import**: upload the bank's daily Excel/CSV → match on voucher number →
  preview matched/unmatched/ambiguous → confirm → bulk payments recorded. This is the single
  highest-ROI integration and needs no commercial relationship.
- Webhooks (v2) are idempotent on `provider_ref`, signature-verified, and always write a
  `payment_events` row before touching a balance.

---

## 8. Defaulters — a worklist, not a report

**Screen:** Fees › Defaulters

- Sorted by **impact** (amount × days overdue), not alphabetically.
- Ageing buckets: 0–30 / 31–60 / 61–90 / 90+, with totals per bucket.
- Each row: student, class, guardian phone, amount, days overdue, **last contacted**, next action.
- Actions: send reminder (templated, per channel), log a call with an outcome, schedule a follow-up,
  create a waiver request, mark as a payment promise with a date.
- **Escalation ladder** configurable per school: day 3 soft SMS → day 10 WhatsApp with the voucher →
  day 20 call task for reception → day 30 principal letter. Automated where the school opts in.
- Promise-to-pay tracking, so reception knows who said they would pay on Friday.

Competitors ship a defaulter *list*. Shipping a defaulter *workflow* with contact history is the
feature an accountant will demo to another school for you.

---

## 9. Financial invariants (tested on every PR)

1. For every voucher: `net_payable = gross − discount − waiver + arrears + late_fee`
2. For every voucher: `balance = net_payable − paid`, and `0 ≤ paid ≤ net_payable`
3. For every payment: `SUM(allocations.amount) = payment.amount`
4. For every student: `SUM(voucher.paid) = SUM(confirmed payments allocated to that student)`
5. School collection for a period = `SUM(allocations)` over vouchers in that period — matched
   independently against `cash_transactions`
6. No `UPDATE` on a `PAID` voucher other than a status transition to `REVERSED`
7. Re-running a completed generation run creates zero rows
8. Deleting a fee plan with issued vouchers is impossible

A nightly `financial-consistency` job re-checks 1–5 across all tenants and raises an alert. When a
number is wrong you want to find out before the school does.

---

## 10. Security deposits

Explicit lifecycle instead of an amount field: `HELD → REFUNDED | FORFEITED | ADJUSTED`.
Received via a normal payment against a `REFUNDABLE` head, but booked to `security_deposits` and
excluded from income. On a student leaving, the deposit appears in the clearance flow: refund
(creates an outgoing transaction), forfeit (becomes income), or adjust against outstanding dues.

---

## 11. Finance (Phase 4)

### Expenses
- Categories (hierarchical, school-configurable) — this is the old "Expense Type" screen, moved to
  Settings where it belongs.
- Expense entry: category, payee, amount, method, date, reference, attachment (bill photo).
- `DRAFT → APPROVED → PAID`, with approval thresholds configurable per school
  (e.g. over PKR 50,000 needs the Principal). Recurring expenses (salaries, rent, utilities) can be
  templated and rolled forward monthly.

### Income
Fee collection flows in automatically from `payments` — **the accountant never re-enters it**.
(In the old portal, "Revenue" being a separate manual screen is a reconciliation bug generator.)
`other_income` covers canteen, events, book sales, etc.

### Day-book & reports
- **Day-book:** every `cash_transactions` row for a date, in and out, with a closing balance and a
  print layout the accountant can hand to the owner.
- **Monthly summary:** income by head, expense by category, net, vs. previous month, vs. budget.
- **Collection report:** expected vs collected vs outstanding, by class, by head, by month.
- **Defaulter ageing report** and **discount/waiver report** ("what did we give away, to whom, why").
- Bank reconciliation: import a statement, auto-match on amount + date + reference, resolve the rest
  manually, lock the period.

### Fiscal locking
Once a month is closed, no back-dated entries without an audited unlock by the Owner. Without this,
last month's reported numbers change after they were reported, and trust is gone.

---

## 12. Definition of done for Phase 2

- [ ] Preview → Generate → Reverse works on a 1,000-student seeded school
- [ ] Generating the same period twice creates zero duplicate vouchers (test asserts this)
- [ ] Counter payment flow completes in under 20 s keyboard-only (measured, not assumed)
- [ ] All 8 financial invariants tested; the nightly consistency job runs in staging
- [ ] Voucher PDF matches the 3-copy Pakistani bank layout and prints correctly on real A4
- [ ] Defaulter worklist with reminder sending and contact history
- [ ] Every fee action appears in the student timeline and the audit log
