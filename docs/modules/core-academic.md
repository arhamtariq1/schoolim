# Module — Core Academic (Phase 1)

Sessions · Classes · Sections · Subjects · Timetable · Students · Guardians · Admissions · Staff

---

## 1. Academic sessions

The session is the backbone. Every enrollment, fee assignment, attendance record, exam and report is
scoped to one.

**Screens:** Settings › Academic › Sessions (list + create) · Session detail (structure, students,
status)

**Rules**

- Exactly one session per school has `is_current = true` (partial unique index enforces it).
- A session moves `PLANNED → ACTIVE → CLOSED`. Closing freezes edits to attendance, marks and
  vouchers in that session; a closed session is read-only except through an audited unlock.
- Sessions may overlap in time (a school can prepare 2027-28 while 2026-27 is running).

### Year rollover — the feature every competitor does badly

A guided wizard, previewable at every step, executed in one transaction, fully reversible until
confirmed:

1. **Create the new session** (dates, name).
2. **Clone structure** — class levels, sections, subjects, class-subject mappings, timetable.
3. **Promote students** — a grid of every enrolled student with a default action (`PROMOTE` to the
   next class level) and per-student overrides: `REPEAT`, `LEAVE`, `GRADUATE`. Bulk-select by
   section. Shows counts before commit.
4. **Assign sections** — auto-distribute by roll order, alphabetically, or keep the previous
   section; respects capacity and warns on overflow.
5. **Clone fee plans** — with an optional increment (see fees module) and a full diff preview.
6. **Carry arrears** — outstanding balances from the old session become opening arrears on the first
   voucher of the new session. Explicit, itemised, opt-in per student.
7. **Review & commit** — one screen showing every change, then commit.

**Rules:** rollover is idempotent per (from_session, to_session) and writes a `job_runs` record.
Arrears carry-forward creates `fee_voucher_lines` with `source = 'ARREAR'` so a parent can see
exactly what the old balance was.

---

## 2. Class levels, sections, subjects

**Screens:** Settings › Academic Structure — a single page with three tabs and inline editing. No
separate "Classes", "Sections" pages in the daily nav.

**Rules**

- `class_levels.numeric_order` drives promotion order and report sorting. Editable by drag.
- A section belongs to (class level × session). Renaming a section never rewrites history —
  enrollments point at the section id.
- Deleting a class level or section with any enrollment is blocked; deactivate instead.
- Capacity is advisory: assigning beyond it warns loudly but does not block (schools overfill and a
  hard block just gets worked around with a fake section).
- Subjects are school-wide; `class_subjects` maps them to a class level per session, with a teacher.

---

## 3. Students

### 3.1 Student list

The reference implementation of the shared `DataTable` (see `reporting.md`).

- Filters: session, class, section, status, gender, fee-plan, has-outstanding, admission date range,
  guardian phone missing, and any active custom field.
- Columns are user-configurable and persist per user; filter sets can be saved and shared as **Saved
  Views** ("Grade 5 defaulters", "New admissions this month").
- Row selection → bulk actions: assign fee plan, change section, send message, mark left, generate
  ID cards, export.
- Server-driven pagination, sorting and search. Search is trigram-based so "ahmd" finds "Ahmed".

### 3.2 Student 360 (the page that did not exist before)

One page, tabbed, that answers every question staff ask about a student:

| Tab        | Content                                                                               |
| ---------- | ------------------------------------------------------------------------------------- |
| Overview   | Photo, key details, current class/section/roll, status, quick actions                 |
| Guardians  | Contacts, fee payer flag, pickup authorisation, siblings in school                    |
| Fees       | Fee plan, discounts, all vouchers with status, payment history, outstanding, deposit  |
| Attendance | Calendar heat map for the session, %, absence streaks, leave records                  |
| Academics  | Exam results, subject-wise trend, report cards                                        |
| Documents  | Uploaded files with type and expiry                                                   |
| Timeline   | Every event: admitted, promoted, section changed, discount approved, payment, warning |
| Notes      | Internal staff notes, with visibility control                                         |

The **Timeline** is the single highest-leverage support feature in the product. When a parent
disputes something, the receptionist reads the timeline instead of calling you.

### 3.3 Admission (creating a student)

A **stepper**, not a 40-field form:

1. Student basics (name, DOB, gender, photo)
2. Guardian(s) — with duplicate detection on CNIC/phone → "This looks like the parent of Ali Raza
   (Grade 3). Link as sibling?"
3. Class & section — shows live capacity
4. Fee plan — pre-selected by class, with discounts (sibling discount auto-suggested if a sibling
   was linked), previewing the first voucher amount before saving
5. Documents (optional, skippable)
6. Review → Admit → prints the admission slip and the first voucher

**Rules**

- Admission number from `number_sequences`, gapless, configurable prefix.
- Roll number auto-assigned within section, editable.
- A student can be admitted with the minimum viable field set; everything else is completable later.
  Incomplete records surface in the Admin task queue rather than blocking the front desk.

### 3.4 Bulk import (build this in Phase 1 — it is a sales tool)

1. Download a template Excel pre-filled with the school's class levels and fee plans.
2. Upload → parse → **validation preview grid** showing every row with per-cell errors, plus
   duplicate detection against existing students.
3. Fix inline in the browser, or download the annotated error file.
4. Import → creates students, guardians, enrollments and fee assignments in one transaction, with a
   rollback token valid for 24 hours.

Anything less than this and a school with 500 students in Excel will not switch.

---

## 4. Guardians

- A guardian is a first-class record, not fields on the student. This is what makes sibling
  discounts, one-voucher-per-family and "message all parents of Grade 5" correct.
- Duplicate detection on CNIC and phone at every entry point.
- `is_fee_payer` decides who receives voucher notifications.
- A guardian with a `user_id` can log into the parent portal and sees **all** their children in one
  place with a child switcher.

---

## 5. Admissions pipeline

**Screen:** Admissions — kanban board (columns = statuses) with a table toggle.

- Enquiry capture from the front desk _and_ an optional public form on the school's site
  (`/apply/{slug}`), rate-limited and captcha-protected.
- Card shows: name, class applied for, guardian phone, days in stage, next action.
- Drag between columns triggers the state machine; illegal transitions are refused by the API.
- Test scheduling → bulk test-slip printing → score entry → offer with an admission fee voucher.
- **Convert to student** copies the application data into the admission stepper pre-filled, and
  links `converted_student_id` so the funnel report is accurate.
- Funnel report: enquiries → tested → offered → enrolled, by source and by class, month over month.
  This tells the principal which marketing actually works — nobody else in this market shows it.

---

## 6. Staff

- Staff list with the same DataTable engine; staff 360 mirroring the student 360 (profile,
  attendance, leave, documents, timeline, salary if permitted).
- Designations and departments are lookup tables, school-configurable.
- Creating a staff member optionally creates a `users` row with the `TEACHER` role and sends an
  invitation. Section assignment drives their scoped permissions automatically.
- `basic_salary_minor` is stored but payroll is Phase 7. Salary is visible only with
  `staff.salary.read`.
- Document expiry tracking (contract, certificates) with reminders — cheap to build, schools love
  it.

---

## 7. Timetable (Phase 1 basic, Phase 7 smart)

- **v1:** a grid editor per section — days × periods, pick subject + teacher. Detects and warns on
  teacher double-booking and room clashes in real time.
- Teacher view: "my week", which feeds the Teacher Today screen and the attendance prompts.
- **v2:** constraint-assisted generation (teacher availability, max periods/day, subject spread). Do
  not attempt an auto-scheduler in v1; it is a research project disguised as a feature.

---

## 8. Edge cases that will bite you

| Case                                        | Handling                                                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Mid-session admission                       | Fee starts from the admission month; optional pro-rata rule per fee head, configurable                                         |
| Student changes section mid-session         | `enrollments` gets `ended_on` + a new row. Attendance history stays attached to the original section.                          |
| Student leaves and returns                  | New enrollment in the same session is allowed; the student record and admission number are reused. Arrears follow the student. |
| Two students with identical names           | Admission number is always shown next to the name in every picker and every table. Never disambiguate by name alone.           |
| Guardian with children in different classes | One guardian, many `student_guardians`. The parent portal switches children; the family voucher option groups them.            |
| Class level renamed ("Grade 5" → "Class V") | Rename in place — ids are stable, history is unaffected.                                                                       |
| Deleting anything                           | Soft delete + a "restore" action for 30 days, except financial records which are never deleted.                                |

---

## 9. Definition of done for Phase 1

- [ ] A brand-new school can create a session, structure, students and staff with zero support.
- [ ] Bulk import handles a real 500-row messy Excel file with a usable error report.
- [ ] Student 360 renders in under 500 ms with all tabs lazily loaded.
- [ ] Every list is exportable to Excel and PDF, permission-checked and audited.
- [ ] Rollover wizard tested end-to-end on a seeded 500-student school.
- [ ] Tenant-isolation and RBAC suites cover every endpoint added.
