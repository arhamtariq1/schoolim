# 08 — Roles, Permissions & Role Workspaces

## 1. The problem with the old portal

The screenshot shows one sidebar with ~20 items and ~30 sub-items, flat, visible to whoever is
logged in. That design has three failure modes:

1. **Every role is shown the whole system**, so every role feels lost.
2. **Navigation is organised by database table** (Classes, Sections, Sessions, Holidays) rather than
   by the job someone is doing.
3. **Frequency is ignored.** "Mark Attendance" (daily, by 40 teachers) sits at the same visual weight
   as "Expense Type" (twice a year, by one accountant).

This document fixes 1 and 2. `10-ux-and-design-system.md` fixes 3.

## 2. Roles

| Role | Who | Primary job |
|---|---|---|
| `OWNER` | School proprietor | Money, everything, billing with Ilm |
| `PRINCIPAL` | Head of school | Oversight, approvals, academic performance |
| `ADMIN` | School administrator | Runs the system day to day; the power user |
| `ACCOUNTANT` | Finance officer | Fees, collection, expenses, reconciliation |
| `RECEPTION` | Front desk | Admission enquiries, fee collection at the counter, visitor/enquiry log |
| `TEACHER` | Teaching staff | Attendance, marks, their own sections |
| `COORDINATOR` | Section/wing head | A teacher, plus oversight of assigned classes |
| `STUDENT` | Student | Their own attendance, fees, results |
| `PARENT` | Guardian | Their children's fees, attendance, results, communication |
| `LIBRARIAN`, `TRANSPORT` | Optional | Feature-flagged, v2 |

Platform side (separate table, separate app): `SUPER_ADMIN`, `SUPPORT`, `BILLING`.

Roles are additive — a user can hold several. A permission is granted if **any** held role grants it.

## 3. Permission naming

`{module}.{resource}.{action}` — lower-case, dot-separated, declared once in
`@ilm/contracts/permissions.ts` as a const array so both API and UI import the same literal union.

Actions: `read` · `create` · `update` · `delete` · `approve` · `export` · `generate` · `configure`

```ts
export const PERMISSIONS = [
  'students.student.read', 'students.student.create', 'students.student.update',
  'fees.plan.configure', 'fees.voucher.read', 'fees.voucher.generate',
  'fees.voucher.cancel', 'fees.payment.create', 'fees.payment.reverse',
  'fees.discount.approve', 'fees.waiver.approve',
  'finance.expense.create', 'finance.expense.approve', 'finance.report.read',
  'attendance.mark', 'attendance.unlock', 'attendance.report.read',
  'staff.record.read', 'staff.salary.read',
  'settings.school.configure', 'settings.user.manage', 'audit.log.read',
  // …
] as const;
export type Permission = (typeof PERMISSIONS)[number];
```

## 4. Permission matrix

`✓` full · `S` scoped (only their own rows / assigned sections / own children) · `–` none

| Permission group | OWNER | PRINCIPAL | ADMIN | ACCOUNTANT | RECEPTION | TEACHER | COORD | STUDENT | PARENT |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Dashboard (role-specific) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Students — read | ✓ | ✓ | ✓ | ✓ | ✓ | S | S | S | S |
| Students — create/update | ✓ | ✓ | ✓ | – | ✓ | – | – | – | – |
| Students — delete/strike off | ✓ | ✓ | – | – | – | – | – | – | – |
| Admissions pipeline | ✓ | ✓ | ✓ | – | ✓ | – | – | – | – |
| Guardians | ✓ | ✓ | ✓ | ✓ | ✓ | S | S | – | S |
| Academic structure (classes/sections/subjects) | ✓ | ✓ | ✓ | – | – | – | S | – | – |
| Timetable — configure | ✓ | ✓ | ✓ | – | – | – | S | – | – |
| Timetable — view | ✓ | ✓ | ✓ | – | ✓ | S | S | S | S |
| Sessions & rollover | ✓ | ✓ | ✓ | – | – | – | – | – | – |
| Fee heads / plans — configure | ✓ | ✓ | ✓ | ✓ | – | – | – | – | – |
| Fee increment — run | ✓ | ✓ | – | ✓ | – | – | – | – | – |
| Voucher — generate | ✓ | ✓ | ✓ | ✓ | – | – | – | – | – |
| Voucher — read | ✓ | ✓ | ✓ | ✓ | ✓ | – | – | S | S |
| Voucher — cancel | ✓ | ✓ | – | ✓ | – | – | – | – | – |
| Payment — record | ✓ | – | ✓ | ✓ | ✓ | – | – | – | – |
| Payment — reverse | ✓ | ✓ | – | ✓ | – | – | – | – | – |
| Discount/waiver — request | ✓ | ✓ | ✓ | ✓ | ✓ | – | – | – | – |
| Discount/waiver — approve | ✓ | ✓ | – | – | – | – | – | – | – |
| Security deposit | ✓ | ✓ | ✓ | ✓ | – | – | – | – | – |
| Defaulters | ✓ | ✓ | ✓ | ✓ | ✓ | – | – | – | – |
| Expenses — create | ✓ | ✓ | ✓ | ✓ | – | – | – | – | – |
| Expenses — approve | ✓ | ✓ | – | – | – | – | – | – | – |
| Finance reports / P&L | ✓ | ✓ | – | ✓ | – | – | – | – | – |
| Attendance — mark | ✓ | – | ✓ | – | ✓ | S | S | – | – |
| Attendance — unlock past date | ✓ | ✓ | ✓ | – | – | – | – | – | – |
| Attendance — reports | ✓ | ✓ | ✓ | – | ✓ | S | S | S | S |
| Staff — read | ✓ | ✓ | ✓ | – | – | – | – | – | – |
| Staff — salary | ✓ | ✓ | – | ✓ | – | – | – | – | – |
| Exams — configure | ✓ | ✓ | ✓ | – | – | – | S | – | – |
| Marks — enter | ✓ | – | ✓ | – | – | S | S | – | – |
| Results — publish | ✓ | ✓ | – | – | – | – | – | – | – |
| Results — view | ✓ | ✓ | ✓ | – | ✓ | S | S | S | S |
| Requests — raise | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Requests — approve | ✓ | ✓ | S | S | – | – | S | – | – |
| Communication — send bulk | ✓ | ✓ | ✓ | ✓ | ✓ | S | S | – | – |
| Settings — school & branding | ✓ | ✓ | ✓ | – | – | – | – | – | – |
| Users & roles | ✓ | ✓ | ✓ | – | – | – | – | – | – |
| Audit log | ✓ | ✓ | – | – | – | – | – | – | – |
| Data export (full) | ✓ | ✓ | – | – | – | – | – | – | – |

**The two separations that matter most:**
- `ACCOUNTANT` can move money but cannot approve discounts or waivers. `PRINCIPAL`/`OWNER` approve
  but cannot silently record payments. Segregation of duties is why schools trust the software.
- `RECEPTION` can take a payment at the counter but cannot cancel a voucher or reverse a payment.

## 5. Scoped permissions (`S`)

Scope is data, not a code branch. It lives in `user_roles.scope` and is compiled into a query clause:

```ts
// shared/rbac/scope.ts
export function studentScope(user: AuthUser): Prisma.StudentWhereInput | undefined {
  if (user.can('students.student.read:all')) return undefined;
  if (user.hasRole('TEACHER') || user.hasRole('COORDINATOR'))
    return { enrollments: { some: { sectionId: { in: user.scope.sectionIds } } } };
  if (user.hasRole('PARENT'))
    return { guardians: { some: { guardian: { userId: user.id } } } };
  if (user.hasRole('STUDENT')) return { userId: user.id };
  return { id: '__none__' };   // fail closed
}
```

**Rule:** scope is applied *in the query*, never by filtering the result set after fetching. A
post-fetch filter still leaked the rows into memory, into the log, and into the count.

## 6. Role workspaces — what each person sees on login

This is the "next level" part. Each role gets a purpose-built home screen and a **different
navigation tree**. Nobody sees a menu item they cannot use.

### OWNER / PRINCIPAL — *"How is my school doing?"*
- Collection this month vs last, as an amount and a % of expected — the single most-wanted number
- Outstanding by ageing bucket (0–30 / 31–60 / 60+) with a one-click drill into defaulters
- Today's attendance %, by wing, with the classes that are outliers
- Pending approvals inbox (discounts, waivers, expenses, leaves) — actionable inline
- Enrolment trend, admissions in the pipeline, staff on leave today
- Nav: Overview · Approvals · Students · Academics · Finance · Staff · Reports · Settings

### ADMIN — *"What needs doing?"*
- Task queue: incomplete admissions, unassigned fee plans, sections over capacity,
  students without a guardian contact, attendance not marked today
- Quick actions: Admit student · Generate vouchers · Send notice · Add staff
- Nav: Home · Students · Admissions · Academics · Fees · Attendance · Staff · Communication · Settings

### ACCOUNTANT — *"Where is the money?"*
- Today's collection (cash / bank / online) with a print-ready day-book
- This period: issued vs collected vs outstanding
- Voucher generation status for the current period, with a **Preview before Generate** entry point
- Defaulter worklist sorted by amount × days overdue, with one-click reminder
- Unreconciled bank entries
- Nav: Home · Fees · Payments · Defaulters · Expenses · Reports · Settings(fees)

### RECEPTION — *"Serve the person in front of me."*
- A single large search box: name / admission no / phone / voucher no → student card
- Collect Fee — the fastest path in the entire product: search → outstanding vouchers →
  amount → method → print receipt. Target: **under 20 seconds, keyboard only.**
- New enquiry / walk-in admission form
- Today's receipts (their own), with reprint
- Nav: Search · Collect Fee · Admissions · Enquiries · Directory

### TEACHER — *"Do my classes."* (mobile-first)
- Today's timetable with a **Mark Attendance** button on each period; unmarked periods are red
- Attendance in one screen: default all present, tap to change, offline tolerant, one submit
- My sections → students → notes
- Marks entry when an exam window is open
- Leave request
- Nav: Today · My Classes · Attendance · Marks · Requests

### STUDENT / PARENT — *"Am I okay?"*
- Current voucher: amount, due date, **Download / Pay**, with payment history
- Attendance: this month's calendar, % for the term
- Results when published
- Notices and messages from the school
- Nav: Home · Fees · Attendance · Results · Notices

## 7. Implementation notes

- The navigation tree is **generated from permissions**, not hard-coded per role:
  `nav.ts` declares each item with a required permission; the shell filters it. Adding a permission
  to a role automatically reveals the right menu items.
- `<Can permission="fees.voucher.generate">` hides UI. The API re-checks. Both, always.
- The role workspace component is chosen by a `primaryRole` derived from the user's highest-privilege
  role, with a switcher when a user holds several (e.g. a teacher who is also a parent).
- Permission changes bump `users.token_version`, invalidating live tokens immediately.

## 8. Testing

`apps/api/test/rbac.e2e-spec.ts` iterates the full matrix in §4: for every (role, endpoint) pair it
asserts allow or deny. When a new endpoint is added without a matrix entry, the test fails with
"endpoint not covered by the permission matrix". Coverage of authorisation is not optional.
