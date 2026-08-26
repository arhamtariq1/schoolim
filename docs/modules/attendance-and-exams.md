# Module — Attendance & Exams (Phases 3 and 7)

---

## Part A — Attendance (Phase 3)

### 1. What makes attendance hard

Not the data model. The **input ergonomics**. A teacher marks 40 students in a corridor, on a phone,
possibly without signal, between two periods. If it takes more than 30 seconds they will stop using
it and go back to the register — and then every attendance report in your product is a lie.

Design consequences, all mandatory:

- **Mobile-first.** The marking screen is designed for a 5-inch screen first, desktop second.
- **Default all present.** The teacher taps only the exceptions. This alone is the difference
  between 30 seconds and 3 minutes.
- **Offline tolerant.** Marks are written to IndexedDB and synced when connectivity returns, with a
  clear pending indicator. A teacher must never lose 40 taps to a dead signal.
- **One submit.** No per-student save. No confirmation dialog.
- **Idempotent submit.** Re-submitting the same section+date updates rather than duplicating
  (`UNIQUE(school_id, student_id, date, period)`).

### 2. Configuration (per school, in Settings)

| Setting              | Options                                                                      |
| -------------------- | ---------------------------------------------------------------------------- |
| Mode                 | `DAILY` (one mark per day) · `PERIOD_WISE` · `TWICE_DAILY`                   |
| Statuses enabled     | Present, Absent, Late, Leave, Half Day, Excused — school picks which it uses |
| Marking window       | e.g. until 11:00 for the same day; after that requires unlock                |
| Back-dating          | Allowed for N days by role; anything older needs `attendance.unlock`         |
| Locking              | Auto-lock a date after N days                                                |
| Absence notification | Notify guardian at HH:MM if absent, on/off, channel                          |
| Working days         | Which weekdays; combined with `holidays` to compute expected days            |

Most schools use `DAILY`. Build `DAILY` first and make `PERIOD_WISE` a flag — do not build a generic
engine for a case one school in twenty needs.

### 3. Marking screen

```
┌──────────────────────────────────────────┐
│ Grade 5 — A        Mon 21 Aug 2026    ⟳  │
│ 38 present · 2 absent · 0 late           │
├──────────────────────────────────────────┤
│ 01  Ahmed Ali            [P] A  L  Lv    │
│ 02  Bilal Khan            P [A] L  Lv    │  ← tap to change
│ 03  Fatima Noor          [P] A  L  Lv    │
│ …                                        │
├──────────────────────────────────────────┤
│ Mark all present   |     Submit (40)     │
└──────────────────────────────────────────┘
```

- Sticky header with a live counter, sticky submit bar.
- Long-press a student → note ("left early, informed").
- Students already on approved leave are **pre-filled as Leave and visually distinguished** — the
  teacher does not re-enter what the office already knows.
- Already-submitted days open in an edit state showing who marked it and when.

Teachers reach this from the **Today** screen, where each period shows a green tick or a red "not
marked" badge. Unmarked periods are the only thing on their home screen that is red.

### 4. Staff attendance

Same engine, different subject. Manual marking by admin/reception, plus optional check-in/check-out
times. Biometric device integration is v2 via a CSV/API import adapter — design the import port now,
build it later.

### 5. Leaves

- Leave types per school with quotas (`leave_types`), separate for students and staff.
- Application → approval chain (uses the shared `workflow` module, not a bespoke one).
- Approved leave automatically pre-fills attendance for the covered dates.
- Balance tracking against quota, visible to the applicant.

### 6. Reports (the part principals actually use)

| Report                   | Why                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| Daily register           | Print-ready, per section, for the file                                                        |
| Monthly summary          | Student × day grid with P/A/L, percentage, total working days                                 |
| Class comparison         | Attendance % by section, with outliers highlighted — spots the class where marking stopped    |
| Chronic absentee list    | Students below a % threshold, or with N consecutive absences → generates parent-contact tasks |
| Staff attendance summary | With late arrivals, for payroll later                                                         |
| Parent view              | Their child's month as a calendar heat map, with the term percentage                          |

**Automation that earns its keep:** an absence notification to the guardian at a configured time,
and a weekly digest to the principal listing sections that were not marked. Attendance data decays
without these.

### 7. Volume & performance

500 students × 200 days = 100k rows/school/year; 100 schools = 10M rows/year.

- `attendance_records` is **range-partitioned by month from the first migration**.
- Reports over long ranges read from a nightly-refreshed `attendance_daily_summary` (school,
  section, date, present, absent, late, leave) rather than scanning raw rows.
- Bulk insert on submit is a single `createMany` with an `ON CONFLICT` upsert.

### 8. Definition of done for Phase 3

- [ ] A teacher marks a 40-student section in under 30 seconds on a phone (measured with a real
      device)
- [ ] Marking works offline and syncs cleanly, including a conflicting edit from another device
- [ ] Duplicate submission creates no duplicate rows
- [ ] Monthly report for a 500-student school renders in under 2 seconds
- [ ] Absence notifications dispatch on schedule with delivery status recorded

---

## Part B — Exams & Results (Phase 7)

### 1. Structure

`exam_terms` (Mid Term, Final) → `exams` (one per class × subject, with total and passing marks and
a weight) → `exam_results` (per student).

`grading_schemes` hold bands as JSON so a school can define its own A+/A/B or a GPA scale without a
code change. Multiple schemes per school; assigned per class level.

### 2. Marks entry

The same ergonomic rules as attendance:

- A spreadsheet-like grid: students down, one mark column, keyboard `Enter`/`Tab` to advance.
- Paste from Excel supported — teachers already have the marks in Excel; fighting that loses.
- Live validation: over the total → blocked; absent → checkbox that skips validation.
- Progress indicator: "32 of 40 entered". Autosave per row; explicit **Submit for review** at the
  end.
- Locked after submission; a coordinator can unlock with a reason (audited).

### 3. Results & report cards

- Computation: subject marks → weighted term total → percentage → grade → position in class/section.
- **Position calculation is a configurable setting** (ties handled as equal rank; some schools do
  not want positions at all — make it a toggle rather than an argument).
- Report card templates as React-PDF components with per-school branding; include attendance
  percentage, remarks, and a subject-wise comparison against the class average.
- Publishing is an explicit, audited action. Before publishing, results are invisible to students
  and parents. Accidental early publication is a real incident at every school.
- Bulk generate → single PDF for a section, or individual PDFs pushed to the parent portal.

### 4. Analytics worth building

- Subject-wise class performance, and per-teacher trend across terms
- Student progress across terms (a line, not a table)
- Failing-subject alerts that create parent-contact tasks
- Grade distribution histogram per class

### 5. Definition of done for Phase 7

- [ ] Marks entry for 40 students in under 2 minutes, including paste-from-Excel
- [ ] Report card PDF matches a real school's existing layout closely enough to replace it
- [ ] Publish/unpublish is atomic, audited, and parent visibility flips immediately
- [ ] Position and grade calculation verified against a real school's manual results
