# Module Specifications

Functional specs per domain. Each one states: what it does, the screens, the business rules, the
edge cases that will bite you, and what "done" means.

| Doc                                                | Covers                                                                                                                                                        | Phase                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| [core-academic.md](core-academic.md)               | Sessions, classes, sections, subjects, timetable, students, guardians, admissions, staff, year rollover                                                       | 1                    |
| [fees-and-finance.md](fees-and-finance.md)         | Fee heads, plans, assignments, discounts, waivers, increments, security deposit, voucher generation, payments, defaulters, expenses, day-book, reconciliation | 2 & 4                |
| [attendance-and-exams.md](attendance-and-exams.md) | Student & staff attendance, leaves, holidays, exams, marks, grading, report cards                                                                             | 3 & 7                |
| [workflow-and-comms.md](workflow-and-comms.md)     | Requests & approvals, notifications, WhatsApp/SMS/email, templates, parent portal                                                                             | 6                    |
| [super-admin.md](super-admin.md)                   | School onboarding, plans, subscriptions, usage metering, impersonation, platform health                                                                       | 5                    |
| [reporting.md](reporting.md)                       | The shared list/report/export engine used by every module                                                                                                     | 1 (engine) → ongoing |

## The mapping from your old sidebar

Every item in the screenshot has a home here — reorganised by job, not by table.

| Old sidebar item                         | Where it lives now                 | Change                                                              |
| ---------------------------------------- | ---------------------------------- | ------------------------------------------------------------------- |
| Dashboard                                | Role workspaces                    | 8 purpose-built dashboards instead of 1                             |
| Students ›                               | Students                           | Adds a single student 360 page; sub-items become tabs               |
| Admission                                | Admissions                         | Becomes a kanban pipeline with a state machine                      |
| Fees › Fee Voucher                       | Fees › Vouchers                    | Adds preview-before-generate, bulk actions, ageing                  |
| Fees › Defaulter List                    | Fees › Defaulters                  | Becomes a _worklist_ with reminder actions, not a report            |
| Fees › Generate Fee                      | Fees › Generate (wizard)           | Idempotent, previewable, reversible run                             |
| Fees › Fee Settings                      | Settings › Fees                    | Moved out of the daily nav — configured rarely                      |
| Fees › Fee Increment                     | Fees › Increments                  | Adds dry-run preview and an applied/rollback record                 |
| Fees › Security Deposit                  | Fees › Deposits                    | Explicit lifecycle: held → refunded/forfeited/adjusted              |
| Fees › Fee Waived Off                    | Fees › Waivers                     | Now an approval workflow, not a direct edit                         |
| Fees › Student list                      | _(removed)_                        | It was a duplicate of Students with a fee filter — now a saved view |
| Requests                                 | Workflow › Requests                | Configurable types + approval chains                                |
| Attendance › Mark                        | Attendance › Mark (mobile-first)   | Teacher taps from Today screen                                      |
| Attendance › Report                      | Attendance › Reports               | Adds ageing, outlier detection, per-parent view                     |
| Finance › Revenue                        | Finance › Income + Fees collection | Fee income flows automatically; no double entry                     |
| Finance › Expense                        | Finance › Expenses                 | Adds approval + attachments                                         |
| Finance › Expense Type                   | Settings › Expense Categories      | Configuration, out of the daily nav                                 |
| Staff                                    | Staff                              | Adds staff 360, attendance, leave, documents                        |
| Classes / Sections / Sessions / Holidays | Settings › Academic Structure      | Four rare-use tables collapsed into one configuration area          |

**Net effect: a ~20-item flat menu becomes 6–8 top-level areas per role, with the rarely-used
configuration screens moved into Settings where they belong.**
