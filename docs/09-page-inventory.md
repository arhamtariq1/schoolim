# 09 — Page Inventory (School Portal)

Every screen in `apps/portal`, what it does, who sees it, and which phase builds it. The Super Admin
app is a **separate application** and is specified in `docs/modules/super-admin.md`.

---

## 1. The number

|                                               |   Pages |
| --------------------------------------------- | ------: |
| **Total routes in the school portal**         | **102** |
| Of which ship by the sellable MVP (Phase 0–5) |      63 |
| Phase 6–9 (comms, exams, payments, scale)     |      39 |

**102 routes, but only 8 sidebar items.** That is the entire point. Roughly a third of these pages
live under Settings (rare, deliberate), a third are detail/wizard pages reached _from_ a list, and
only about 20 are places a person navigates to directly. The old portal put ~30 of them in one flat
menu; this one surfaces 5–8 per role.

**Reading the tables**

- **Archetype** — one of the five patterns in `docs/10-ux-and-design-system.md` §3: `List` ·
  `Detail` · `Wizard` · `Workspace` · `Form`. Every page is one of them. No exceptions.
- **Phase** — from `docs/14-roadmap-and-phases.md`.
- **Roles** — O=Owner, P=Principal, A=Admin, F=Accountant (finance), R=Reception, T=Teacher,
  C=Coordinator, S=Student, G=Guardian/Parent. Access is by _permission_, never by role check in a
  component; the roles column is only a reading aid.

**Rules that apply to every page below, so they are not repeated 102 times**

1. Loading (skeleton), empty (with the action that fills it) and error states are part of "done".
2. Every list: server-side pagination, sort, saved filters, column chooser, CSV/XLSX export,
   bulk-select-all-matching-filter, and a bulk action bar.
3. Every mutation: optimistic where safe, audited server-side, permission-checked server-side.
4. Every page is reachable from ⌘K, and every ⌘K entry has a keyboard shortcut.
5. Every money figure is monospace, minor-unit backed, right-aligned, and drillable.

---

## 2. Auth & entry — 7 pages

| Route                  | Page                       | Archetype | Phase | Roles            |
| ---------------------- | -------------------------- | --------- | ----- | ---------------- |
| `/login`               | Sign in                    | Form      | P0    | all              |
| `/forgot-password`     | Request reset link         | Form      | P0    | all              |
| `/reset-password`      | Set new password           | Form      | P0    | all              |
| `/accept-invite`       | Activate invited account   | Form      | P0    | all              |
| `/select-role`         | Role/child switcher        | Form      | P1    | multi-role users |
| `/onboarding`          | New-school setup checklist | Wizard    | P1    | O P A            |
| `/error`, `/not-found` | System states              | —         | P0    | all              |

**Functions**

- **Login** — email or phone + password · school resolved from subdomain (never a school picker that
  leaks the tenant list) · rate limit + lockout after N failures · "remember this device" · redirect
  back to the originally requested URL · Urdu/English toggle.
- **Invite / reset** — single-use, expiring, hashed token · password strength meter · argon2id on
  the server · invalidates all existing sessions of that user on completion.
- **Select role** — for a teacher who is also a parent, or an accountant who is also an admin.
  Switches the whole workspace and nav tree, remembered per device.
- **Onboarding checklist** — verify school details → confirm session → add class levels & sections →
  import students → configure fee heads & plans → invite staff. Progress bar, resumable,
  dismissible, each step deep-links to the real page. Includes **sample data on/off** so a school
  can explore safely and wipe in one click.

---

## 3. Home — 6 role workspaces on one route

`/` renders a different workspace component chosen from the user's primary role. Same URL, six
experiences. **Phase 1 (skeleton) → filled in as each module lands.**

| Variant       | Roles | What is on it                                                                                                                                                                                                                                                       |
| ------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Leadership    | O P   | Collection this month vs expected (amount + %) · outstanding by ageing bucket 0–30/31–60/60+ · today's attendance % by wing with outlier classes · **pending approvals inbox, actionable inline** · enrolment trend · admissions in pipeline · staff on leave today |
| Administrator | A     | Task queue: incomplete admissions, students with no fee plan, sections over capacity, students with no guardian contact, attendance not marked today · quick actions: Admit · Generate vouchers · Send notice · Add staff                                           |
| Accountant    | F     | Today's collection split cash/bank/online with print-ready day-book · issued vs collected vs outstanding for the period · voucher-run status with a **Preview** entry point · defaulter worklist sorted by amount × days overdue · unreconciled bank entries        |
| Front desk    | R     | One large search box (name / admission no / phone / voucher no) · **Collect Fee** as the primary button · new enquiry · today's own receipts with reprint                                                                                                           |
| Teacher       | T C   | Today's timetable with a Mark Attendance button per period, unmarked periods in red · my sections · open marks-entry windows · my leave balance                                                                                                                     |
| Family        | S G   | Current voucher with due date and Pay/Download · payment history · this month's attendance calendar · published results · notices · child switcher for parents with several children                                                                                |

Every tile is drillable — clicking a number lands on the filtered list that produced it.

---

## 4. Students & people — 10 pages

| Route                   | Page                    | Archetype    | Phase | Roles               |
| ----------------------- | ----------------------- | ------------ | ----- | ------------------- |
| `/students`             | Student list            | List         | P1    | O P A F R T(S) C(S) |
| `/students/new`         | Admission / add student | Wizard       | P1    | O P A R             |
| `/students/import`      | Bulk import from Excel  | Wizard       | P1    | O P A               |
| `/students/[id]`        | **Student 360**         | Detail       | P1    | all (scoped)        |
| `/students/[id]/edit`   | Edit student            | Form         | P1    | O P A R             |
| `/guardians`            | Guardian list           | List         | P1    | O P A F R           |
| `/guardians/[id]`       | Guardian detail         | Detail       | P1    | O P A F R           |
| `/admissions`           | Admissions pipeline     | List (board) | P1    | O P A R             |
| `/admissions/enquiries` | Enquiry log             | List         | P1    | O P A R             |
| `/admissions/[id]`      | Application detail      | Detail       | P1    | O P A R             |

**Functions**

- **Student list** — filter by class/section/session/status/gender/fee-plan/defaulter/transport ·
  saved views ("Grade 5 defaulters") · quick search · density toggle · bulk: assign fee plan, change
  section, promote, strike off, send message, export, print ID cards, generate vouchers for
  selection.
- **Student 360** — the page that did not exist in the old portal. Header card: photo, name,
  admission no, class-section, status, guardian phone, **outstanding balance**, primary actions.
  Tabs: Profile · Guardians & contacts · Enrolment history · **Fees** (vouchers, payments,
  discounts, balance) · Attendance (calendar + %) · Results · Documents · Requests · **Timeline**
  (every audited change, who and when). One page answers every question reception is ever asked on
  the phone.
- **Admission wizard** — student → guardians → enrolment (session/class/section) → fee plan +
  one-time charges → documents → **review & confirm**. Generates admission number from
  `number_sequences` (gapless, per school). Optionally creates the first voucher immediately.
- **Bulk import** — upload XLSX/CSV → column mapping UI (remembered per school) → **validation
  report with row-level errors and a downloadable "fix these" file** → dry-run preview of exactly
  what will be created → commit, idempotent and resumable. This is a sales tool, not a utility: a
  school's data must land in under an hour.
- **Admissions pipeline** — Kanban by stage (Enquiry → Form → Test → Interview → Offer → Enrolled →
  Rejected), drag to move stage, per-stage required fields, convert-to-student in one click,
  follow-up reminders, source/conversion reporting.
- **Guardians** — one guardian, many children, across classes. Merge duplicates. Contact preferences
  and channel opt-outs live here.

---

## 5. Academics — 7 pages

| Route                      | Page                         | Archetype       | Phase | Roles   |
| -------------------------- | ---------------------------- | --------------- | ----- | ------- |
| `/academics/sessions`      | Academic sessions            | List + Form     | P1    | O P A   |
| `/academics/classes`       | Class levels & sections      | List            | P1    | O P A   |
| `/academics/sections/[id]` | Section detail               | Detail          | P1    | O P A C |
| `/academics/subjects`      | Subjects & class-subject map | List            | P1    | O P A   |
| `/academics/timetable`     | Timetable builder            | Form (grid)     | P1/P7 | O P A C |
| `/academics/rollover`      | Year rollover & promotion    | Wizard          | P1    | O P A   |
| `/academics/calendar`      | Holidays & events            | List (calendar) | P1    | O P A   |

**Functions**

- **Sessions** — create, set current, lock a closed session read-only, per-session term/exam
  windows.
- **Classes & sections** — class level, section, capacity, class teacher, room; enrolment count and
  over-capacity warnings inline; reorder for display; archive without deleting history.
- **Section detail** — roster, class teacher, subjects, timetable, attendance summary, quick actions
  (message the section, mark attendance, print roster).
- **Timetable** — periods per day, day templates, drag subjects onto a grid, teacher-clash and
  room-clash detection, publish to teachers/students, print per class and per teacher.
- **Rollover** — the feature every competitor does badly. Select source and target session →
  promotion rules per class (promote all / by result / manual) → carry-forward of outstanding
  balances → fee plan mapping for the new year → **preview showing exactly how many students move
  where, and who is left behind** → commit, reversible while the new session has no transactions.
- **Calendar** — holidays (affect attendance calculation), exam windows, events; recurring rules.

---

## 6. Fees — 10 pages _(the commercial core)_

| Route                 | Page                   | Archetype | Phase | Roles                 |
| --------------------- | ---------------------- | --------- | ----- | --------------------- |
| `/fees`               | Fees overview          | Workspace | P2    | O P A F               |
| `/fees/vouchers`      | Voucher list           | List      | P2    | O P A F R, S/G scoped |
| `/fees/vouchers/[id]` | Voucher detail         | Detail    | P2    | O P A F R, S/G scoped |
| `/fees/generate`      | **Generate vouchers**  | Wizard    | P2    | O P A F               |
| `/fees/runs`          | Generation run history | List      | P2    | O P A F               |
| `/fees/runs/[id]`     | Run detail & reversal  | Detail    | P2    | O P A F               |
| `/fees/defaulters`    | Defaulter worklist     | List      | P2    | O P A F R             |
| `/fees/discounts`     | Discounts & waivers    | List      | P2    | O P A F R             |
| `/fees/increments`    | Annual fee increment   | Wizard    | P2    | O P F                 |
| `/fees/deposits`      | Security deposits      | List      | P2    | O P A F               |

**Functions**

- **Overview** — period selector; issued vs collected vs outstanding; collection curve vs last
  month; per-class collection table; the four buttons that matter (Generate · Collect · Defaulters ·
  Print).
- **Voucher list** — tabs All / Issued / Partially paid / Paid / Overdue / Cancelled; filter by
  class, section, billing period, fee head, amount range, days overdue; bulk: print (batched PDF,
  4-up or A5), send by WhatsApp/SMS/email, cancel, extend due date, apply late fee, export.
- **Voucher detail** — line-by-line breakdown (head, gross, discount, net), arrears carried forward,
  late fee, payment history with receipt links, status timeline, print/download, cancel with reason.
  **Nothing on a paid voucher is editable — corrections are reversing entries.**
- **Generate vouchers** — the batch engine, and the single highest-risk screen in the product:
  1. Scope — session, billing period, classes/sections or a filtered student set.
  2. Options — due date, include arrears, apply late fee rule, include one-time charges.
  3. **Preview (non-negotiable)** — how many vouchers, total amount, per-class breakdown, and an
     explicit **exclusions list with reasons** ("12 students have no fee plan → [Assign now]", "3
     already have a voucher for this period"). Nothing is written yet.
  4. Generate — idempotency key on (school, period, scope); advisory lock so two clicks cannot
     double-run; 200-student chunks with a persisted cursor; progress with resume-on-failure;
     `UNIQUE(school_id, student_id, billing_period_id)` makes double-billing impossible even if
     everything above fails.
  5. Result — counts, failures, links to the run, and one-click print/send.
- **Run history & reversal** — every run recorded with who, when, scope, counts, duration, status.
  **Reverse the whole run** while all its vouchers are unpaid; partial reversal by selection after.
- **Defaulters** — a worklist, not a report: sorted by amount × days overdue, ageing buckets,
  guardian phone inline, one-click reminder (template + channel), snooze with a note, promise-to-pay
  date, call log per student, escalation to the principal.
- **Discounts & waivers** — request → approve/reject with reason → apply. Percentage or fixed, per
  head or whole voucher, date-bounded, recurring or one-off. Segregation of duties is enforced:
  whoever requests cannot approve.
- **Increments** — select classes/heads → percentage or fixed uplift → **preview old vs new per
  class with the total annual revenue delta** → apply from a chosen effective date. Reversible.
- **Deposits** — record, hold, adjust against dues, refund on leaving with a clearance check.

---

## 7. Payments & collection — 5 pages

| Route                      | Page                      | Archetype | Phase | Roles     |
| -------------------------- | ------------------------- | --------- | ----- | --------- |
| `/payments/collect`        | **Collect fee (counter)** | Form      | P2    | O A F R   |
| `/payments`                | Payments & receipts       | List      | P2    | O P A F R |
| `/payments/[id]`           | Receipt detail            | Detail    | P2    | O P A F R |
| `/payments/daybook`        | Day book / cash close     | List      | P4    | O P F     |
| `/payments/reconciliation` | Bank reconciliation       | List      | P8    | O P F     |

**Functions**

- **Collect fee** — the fastest path in the product; the target is **under 20 seconds, keyboard
  only**: search (name / admission no / phone / voucher no) → student card with outstanding vouchers
  pre-selected oldest-first → amount (full, partial, or across several vouchers) → method
  (cash/bank/cheque/online/adjustment) → reference → **Enter prints the receipt**. Change/overpay
  handling, advance credit, allocation preview before commit, duplicate-payment guard, offline-safe
  receipt numbering from `number_sequences`.
- **Payments list** — filter by date, method, collector, class; totals per method in the header;
  reprint; **reverse a payment** (never delete — a reversing entry, with reason, audited).
- **Receipt detail** — allocation across vouchers and heads, printable A5/thermal layout, resend.
- **Day book** — one day, all money in and out, opening/closing cash, per-collector totals,
  print-ready, and a **close-the-day** action that locks the date for non-privileged edits.
- **Reconciliation** — import a bank statement, auto-match by reference/amount/date, manual match,
  unmatched worklist, gateway settlement vs recorded payments.

---

## 8. Attendance — 5 pages

| Route                 | Page                       | Archetype   | Phase | Roles                  |
| --------------------- | -------------------------- | ----------- | ----- | ---------------------- |
| `/attendance/mark`    | **Mark attendance**        | Form        | P3    | A R T(S) C(S)          |
| `/attendance`         | Register (section × month) | List (grid) | P3    | O P A C                |
| `/attendance/reports` | Attendance reports         | List        | P3    | O P A R T(S) C(S) S/G  |
| `/attendance/staff`   | Staff attendance           | List        | P3    | O P A                  |
| `/attendance/leaves`  | Leaves                     | List        | P3    | all (own), O P A (all) |

**Functions**

- **Mark attendance** — mobile-first, designed for a teacher standing in a classroom: pick section +
  date (defaults to today's period), **everyone present by default**, tap to change, statuses
  Present/Absent/Late/Leave/Half-day, bulk mark, reason note per student, works offline and syncs,
  one submit, then **locked** — changing a past date needs `attendance.unlock` and is audited.
- **Register** — the month grid the school actually prints: section × days, per-student %, holidays
  greyed, editable only by the unlock permission, export and print.
- **Reports** — daily summary by class/wing, monthly percentage, **students below a threshold** (the
  report principals use), consecutive-absence alert list, per-student calendar, trend by month.
  Every report exports and prints.
- **Staff attendance** — same model, plus late-arrival and short-leave tracking; feeds payroll
  later.
- **Leaves** — apply (student or staff), balance, approval chain, calendar of who is out today.

---

## 9. Staff — 4 pages

| Route            | Page             | Archetype | Phase | Roles |
| ---------------- | ---------------- | --------- | ----- | ----- |
| `/staff`         | Staff list       | List      | P1    | O P A |
| `/staff/new`     | Add staff        | Wizard    | P1    | O P A |
| `/staff/[id]`    | Staff 360        | Detail    | P1    | O P A |
| `/staff/payroll` | Salary & payroll | List      | P9    | O P F |

**Functions**

- **List** — filter by department/designation/status; bulk invite to the portal, message, export.
- **Add staff** — personal → employment (designation, department, joining date, salary) → portal
  access (role assignment + scope: which sections) → documents. Creating the user account and
  sending the invite is part of the same wizard, not a separate errand.
- **Staff 360** — profile, assigned sections and subjects, timetable, attendance, leaves, documents,
  salary (permission-gated separately from the rest of the record), timeline.
- **Payroll** — salary structure, monthly run with attendance/leave deductions, payslips, register.
  Deliberately last: it is a different product and can be sold as an add-on.

---

## 10. Exams & results — 6 pages

| Route                 | Page                  | Archetype   | Phase | Roles       |
| --------------------- | --------------------- | ----------- | ----- | ----------- |
| `/exams`              | Exam terms            | List        | P7    | O P A C     |
| `/exams/[id]`         | Exam setup            | Form        | P7    | O P A C     |
| `/exams/[id]/marks`   | **Marks entry**       | Form (grid) | P7    | A T(S) C(S) |
| `/exams/[id]/results` | Results & publish     | List        | P7    | O P A       |
| `/exams/report-cards` | Report cards          | Wizard      | P7    | O P A       |
| `/exams/analytics`    | Performance analytics | Workspace   | P7    | O P C       |

**Functions**

- **Exam setup** — term, subjects per class, max/passing marks, weightage, date sheet, grading
  scale, marks-entry window (open/close per class-subject).
- **Marks entry** — a keyboard-driven grid: one subject × one section, tab/enter to move, paste from
  Excel, out-of-range validation on the spot, absent/exempt flags, autosave draft, submit → locked;
  a teacher sees only their own class-subjects.
- **Results** — compute totals, percentage, grade, position; per-class result sheet; pass/fail
  summary; **publish** (the only moment students and parents can see anything) with an unpublish.
- **Report cards** — pick class + term → choose a template → **preview** → batch PDF, print or send.
  Templates are data (school logo, grading legend, remarks, signatures), never per-school code.
- **Analytics** — subject-wise averages, class comparison, top/bottom performers, improvement vs the
  previous term, teacher-wise outcomes for the principal.

---

## 11. Finance — 6 pages

| Route                   | Page                     | Archetype | Phase | Roles   |
| ----------------------- | ------------------------ | --------- | ----- | ------- |
| `/finance`              | Finance overview         | Workspace | P4    | O P F   |
| `/finance/expenses`     | Expenses                 | List      | P4    | O P A F |
| `/finance/expenses/new` | Record expense           | Form      | P4    | O P A F |
| `/finance/income`       | Other income             | List      | P4    | O P F   |
| `/finance/reports`      | Financial reports        | List      | P4    | O P F   |
| `/finance/periods`      | Fiscal periods & locking | List      | P4    | O P     |

**Functions**

- **Overview** — income vs expense for the period, cash position, top expense categories, pending
  approvals, month-on-month trend.
- **Expenses** — category, vendor, payment method, attachment (bill photo), approval state;
  recurring expenses; bulk approve; filter by category/vendor/date/approver.
- **Other income** — anything that is not fees: donations, rent, events, book/uniform sales.
- **Reports** — income statement, expense by category, collection vs expense, cash flow, ledger by
  account, exportable and printable, every figure drillable to its transactions.
- **Fiscal periods** — close a month so nothing can be backdated into it; reopening is a privileged,
  audited act. This is what makes the numbers trustworthy.

---

## 12. Requests & approvals — 4 pages

| Route            | Page            | Archetype | Phase | Roles                 |
| ---------------- | --------------- | --------- | ----- | --------------------- |
| `/requests`      | My requests     | List      | P6    | all                   |
| `/requests/new`  | Raise a request | Form      | P6    | all                   |
| `/requests/[id]` | Request detail  | Detail    | P6    | requester + approvers |
| `/approvals`     | Approvals inbox | List      | P6    | O P A F C (scoped)    |

**Functions**

- Request **types are data**, not code: `request_types` carries a JSON form schema and an approval
  chain, so a school can add "Bus route change" without a deploy. Seeded types: leave, fee discount,
  fee waiver, character/transfer certificate, document request, section change, expense approval.
- **Raise** — the form renders from the type's JSON schema, with attachments.
- **Detail** — current stage, who is waiting on whom, comments, attachments, full history.
- **Approvals inbox** — everything waiting on me across every type, approve/reject inline with a
  reason, bulk approve, delegate while on leave, SLA/ageing indicator.
- **Transfer certificate / clearance** is called out specially: it checks outstanding dues, library
  and transport clearance before it can be issued, then produces a numbered printable certificate.

---

## 13. Communication — 5 pages

| Route                        | Page                    | Archetype   | Phase | Roles                     |
| ---------------------------- | ----------------------- | ----------- | ----- | ------------------------- |
| `/communication`             | Message log             | List        | P6    | O P A F R                 |
| `/communication/compose`     | Bulk message            | Wizard      | P6    | O P A F R, T/C scoped     |
| `/communication/templates`   | Templates               | List + Form | P6    | O P A                     |
| `/communication/notices`     | Notice board            | List        | P6    | O P A (write), all (read) |
| `/communication/automations` | Automated notifications | Form        | P6    | O P A                     |

**Functions**

- **Compose** — pick an audience by filter (class, section, defaulters over N days, a saved view,
  hand-picked students) → channel (in-app, SMS, WhatsApp, email) → template with merge fields →
  **preview with real data for three sample recipients and the cost estimate** → send or schedule.
- **Log** — per message: recipients, channel, delivered/failed/read, cost, who sent it; resend
  failures only; filter and export.
- **Templates** — versioned, per channel, with merge fields (`{{student.name}}`, `{{voucher.due}}`),
  bilingual variants, and a test-send.
- **Notices** — school-wide or targeted, scheduled publish/expiry, attachments, read receipts.
- **Automations** — opt-in per school, each with its own on/off and quiet hours: voucher issued,
  payment received, N days before due, N days overdue, absent today, result published, request
  status changed. Every automation shows its monthly volume and cost before it is enabled.

---

## 14. Reports — 3 pages

| Route              | Page                     | Archetype | Phase | Roles                 |
| ------------------ | ------------------------ | --------- | ----- | --------------------- |
| `/reports`         | Report catalogue         | List      | P4    | O P A F               |
| `/reports/[key]`   | Report runner            | List      | P4    | permission per report |
| `/reports/exports` | Export & download centre | List      | P4    | O P A F               |

**Functions**

- **Catalogue** — grouped by module (Students, Fees, Attendance, Finance, Exams, Staff), searchable,
  with favourites and a "recently run" list. ~30 standard reports at MVP.
- **Runner** — one component for every report: parameter bar → table → chart where it helps → export
  (CSV/XLSX/PDF) → print layout → **save as a scheduled report** (emailed monthly).
- **Export centre** — large exports run as background jobs; this is where they land, with progress,
  expiry, and re-download. A 500-student PDF batch never blocks the browser.

---

## 15. Settings — 15 pages

One destination, five groups. **Roughly half of the old sidebar lives here** — configured rarely,
away from daily work.

| Route                     | Page                             | Group    | Phase | Roles   |
| ------------------------- | -------------------------------- | -------- | ----- | ------- |
| `/settings/school`        | School profile & branding        | System   | P1    | O P A   |
| `/settings/academic`      | Academic rules                   | Academic | P3    | O P A   |
| `/settings/fees`          | Fee heads, plans, late-fee rules | Fees     | P2    | O P A F |
| `/settings/finance`       | Expense categories, accounts     | Fees     | P4    | O P F   |
| `/settings/users`         | Users & invitations              | People   | P1    | O P A   |
| `/settings/roles`         | Roles & permissions              | People   | P1    | O P A   |
| `/settings/custom-fields` | Custom fields                    | System   | P1    | O P A   |
| `/settings/request-types` | Request types & approval chains  | System   | P6    | O P A   |
| `/settings/communication` | Channels, sender IDs, quotas     | Comms    | P6    | O P A   |
| `/settings/documents`     | Print templates & numbering      | System   | P2    | O P A   |
| `/settings/integrations`  | Gateways & webhooks              | System   | P8    | O P     |
| `/settings/features`      | Enabled modules (read-only)      | System   | P5    | O P A   |
| `/settings/audit`         | Audit log                        | System   | P1    | O P     |
| `/settings/data`          | Import, export, backup           | System   | P1    | O P     |
| `/settings/billing`       | Subscription with Ilm            | System   | P5    | O       |

**Functions worth calling out**

- **School & branding** — name, logo, letterhead, address, contact, timezone, currency, week start,
  **primary colour** (a runtime CSS-variable swap; no rebuild, no per-tenant bundle), language.
- **Academic rules** — attendance statuses and whether late counts as present, half-day rule,
  minimum-attendance threshold, grading scale, promotion criteria, working days per week.
- **Fees** — fee heads (recurring/one-time/optional), fee plans per class with the **months each
  line applies to** (this one field removes most "this school is different" pressure), per-student
  overrides, late-fee rule (fixed/percentage, grace days, cap), discount types, arrears policy.
- **Users & roles** — invite, deactivate (never hard-delete), force sign-out, reset password, assign
  roles **with scope** (which sections a coordinator oversees). Custom roles are a permission matrix
  a school ticks; changing them bumps `token_version` so live sessions update immediately.
- **Custom fields** — add a field to Student / Guardian / Staff / Admission with a type, validation
  and whether it is required, searchable, or printed. Stored as `custom jsonb` against a
  `custom_field_defs` definition. This is the mechanism that replaces school-specific code.
- **Documents** — voucher, receipt, ID card, certificate and report-card layouts; header/footer;
  logo placement; and `number_sequences` (prefix, padding, reset-per-year) for gapless numbering.
- **Audit log** — actor, action, entity, before, after, IP, time; filterable; exportable. Read-only,
  forever.
- **Data** — student/staff/fee import, full export ("your data is yours" — a real retention
  feature), on-demand backup request, and sample-data wipe.
- **Billing** — plan, student count vs limit, invoices from Ilm, payment method. Read-only mirror of
  the Super Admin app.

---

## 16. Account — 3 pages

| Route               | Page                        | Archetype | Phase | Roles |
| ------------------- | --------------------------- | --------- | ----- | ----- |
| `/me/profile`       | My profile                  | Form      | P1    | all   |
| `/me/security`      | Password, sessions, devices | Form      | P1    | all   |
| `/me/notifications` | Notification preferences    | Form      | P6    | all   |

Change password (revokes other sessions) · active session list with sign-out-everywhere ·
per-channel notification opt-in/out · language and density preference · 2FA (Phase 9).

---

## 17. Parent & student — 6 pages

Same application, same components, scoped data — not a second codebase. Mobile-first, PWA
installable.

| Route            | Page                 | Archetype         | Phase | Roles |
| ---------------- | -------------------- | ----------------- | ----- | ----- |
| `/my/children`   | Child switcher       | List              | P6    | G     |
| `/my/fees`       | Fees & payments      | List              | P6    | S G   |
| `/my/attendance` | Attendance           | Detail (calendar) | P6    | S G   |
| `/my/results`    | Results              | Detail            | P7    | S G   |
| `/my/notices`    | Notices & messages   | List              | P6    | S G   |
| `/my/documents`  | Documents & requests | List              | P6    | S G   |

**Functions** — current voucher with amount, due date, download PDF and **Pay online** (Phase 8) ·
full payment history with receipt downloads · month calendar with per-status legend and term
percentage · report card download when published · notices with read state · raise a request (leave,
certificate, document) and track it · update contact details subject to approval.

---

## 18. What is deliberately not a page

| Not built                                             | Why                                                                        |
| ----------------------------------------------------- | -------------------------------------------------------------------------- |
| A separate "Fee Settings" sidebar item                | It is `/settings/fees`, away from daily work                               |
| "Student list" appearing under both Students and Fees | One authoritative list; Fees links into it filtered                        |
| A page per report                                     | One runner, ~30 report descriptors as data                                 |
| A page per school's special form                      | `custom_field_defs` and `request_types` — configuration, never code        |
| Per-school dashboards                                 | One workspace per role, tiles toggled by feature flag                      |
| A "Modules" mega-menu                                 | Nav is generated from permissions; if you cannot use it, you cannot see it |

---

## 19. Build order, restated as pages

| Phase                    | Pages added | Cumulative | The thing you can demo                         |
| ------------------------ | ----------: | ---------: | ---------------------------------------------- |
| P0 Foundation            |           5 |          5 | Log in, tenant isolation proven                |
| P1 Core Academic         |          30 |         35 | A school's students are in the system          |
| P2 Fees Engine           |          17 |         52 | 500 vouchers generated and collected           |
| P3 Attendance            |           5 |         57 | Teachers marking on phones                     |
| P4 Finance & Reports     |          12 |         69 | The principal's monthly numbers                |
| P5 Super Admin           |          6* |         75 | **Sellable.** A school onboarded in 10 minutes |
| P6 Comms & Parent portal |          17 |         92 | Parents see their own voucher                  |
| P7 Exams                 |           6 |         98 | Report cards printed                           |
| P8 Payments              |           2 |        100 | Online payment, verified server-to-server      |
| P9 Scale                 |           2 |        102 | Payroll, multi-branch                          |

\* Phase 5's main work is the _separate_ Super Admin app; the 6 counted here are the portal-side
settings and billing pages it requires.

---

**Related:** `docs/08-rbac-and-roles.md` (who sees what) · `docs/10-ux-and-design-system.md` (how
each page is built) · `docs/modules/` (the domain logic behind these screens) ·
`docs/14-roadmap-and-phases.md` (when).

---

## 20. Addendum — Group console (Phase 9, school groups only)

Multi-campus chains get **8 additional routes**, enabled only when `schools.school_group_id` is set.
A standalone school never sees them. Reads span campuses; **every write still happens inside exactly
one campus** — see `docs/adr/0008-school-groups-and-multi-campus.md`.

| Route               | Page                                               | Archetype | Roles                    |
| ------------------- | -------------------------------------------------- | --------- | ------------------------ |
| `/group`            | Group overview                                     | Workspace | GROUP_OWNER, GROUP_ADMIN |
| `/group/campuses`   | Campus list                                        | List      | GROUP_OWNER, GROUP_ADMIN |
| `/group/collection` | Consolidated collection & outstanding              | List      | GROUP_*                  |
| `/group/compare`    | Campus comparison                                  | List      | GROUP_OWNER, GROUP_ADMIN |
| `/group/students`   | Cross-campus student search & transfer             | List      | GROUP_OWNER, GROUP_ADMIN |
| `/group/staff`      | Group staff directory                              | List      | GROUP_OWNER, GROUP_ADMIN |
| `/group/templates`  | Shared fee heads, grading scales, templates        | Form      | GROUP_OWNER, GROUP_ADMIN |
| `/group/settings`   | Group profile, branding, billing mode, group roles | Form      | GROUP_OWNER              |

**Functions**

- **Overview** — collection vs expected for every campus in one table, group total, worst-performing
  campus, group-wide outstanding by ageing bucket, enrolment by campus, today's attendance by
  campus.
- **Compare** — the same metric side by side across campuses over time (collection %, attendance %,
  enrolment, fee per student, expense ratio). This is the single screen a chain owner buys.
- **Campus switcher** — in the top bar everywhere, not just here. Switching sets a single-campus
  context and the whole portal becomes that campus's, with that campus's branding.
- **Templates** — head office defines a fee head or grading scale once and pushes it; each campus
  receives a normal campus-owned row flagged `managed_by_group` that it can use but not edit.
- **Transfer** — move a student between campuses: clearance check, dues settlement, record copy,
  admission number re-issued in the destination campus's series. An explicit operation, never a
  shared row.

**Total with the group console: 110 routes.**
