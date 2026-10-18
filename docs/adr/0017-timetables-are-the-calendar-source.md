# ADR-0017 — Timetables are the source of truth; the calendar reads them

**Status:** accepted · 2026-10-18

## Context

The school needs two kinds of schedule: a **class timetable** (the weekly periods of a class or
section) and an **assessment timetable** (dated tests and exams, several subjects per sheet). Both
must show on the Academic Calendar, be editable, be hidden from parents until they are ready, and
tell the right teachers and parents when they are published or change.

`academics.timetable.read|configure` already exist in the permission table; nothing else did.
Assessment *results* already have their own tables (`assessments`, `mark_entries`).

## Decision

1. **Two tables.** `timetables` (class, optional section, session, kind, title, status) and
   `timetable_entries` (subject, teacher, room, a weekday **or** a date, start and end time).
   Times are `HH:MM` text with a check constraint — a clock time has no time zone, and text compares
   correctly when zero-padded.
2. **The calendar reads timetable entries; it does not hold a copy.** "Synchronise" is therefore not
   a job: editing an entry changes the calendar on the next read, deleting a timetable removes its
   events, and a duplicate cannot exist because there is only one row. A synchronisation table would
   be a second source of truth whose bugs are exactly the ones the brief lists.
3. **Weekly periods are expanded per date at read time**, between the timetable's effective dates
   and the session's. To keep the calendar legible, a manager looking at the whole school sees
   assessments only; class periods appear for a chosen class, and always for a teacher's or a
   parent's own classes.
4. **Draft and Published.** Only a published timetable is visible to anyone but a manager. A
   timetable cannot be published empty.
5. **One rule decides who sees what**, as a query clause (docs/04 §5): managers see all; every
   teacher sees every published timetable of the school (they cover for each other, and read
   exam schedules of classes they do not teach); a
   parent (and a student) sees published timetables of the class and section their child is
   enrolled in. Anything else is "not found".
6. **Only the office writes.** `academics.timetable.configure` is required **unscoped**, so a
   coordinator's scoped grant does not reach it.
7. **Conflicts are refused, not warned.** Within one session and the same kind of schedule, two
   entries may not overlap for the same class (a whole-class entry overlaps every section), the same
   teacher, or the same room. The error names who and when. Weekly periods are compared with weekly
   periods, and dated entries with dated entries; a test sheet replacing a day's periods is the
   school's own decision, not a clash.
8. **Subjects, assessment types and teachers are reused**, never duplicated. A class with subjects
   configured may only schedule those; a teacher must be an active teacher.
9. **Notifications** go to the teachers named on an entry or assigned to the class, and to the
   guardians of children enrolled in it, when a timetable is published and when a published one
   changes in substance (not for a typo in the description). The actor never hears their own change.

## Consequences

- A school that wants one tap to see "everything scheduled across all classes today" on the calendar
  does not get class periods in that view; it picks a class.
- Existing schools keep the assessment types they have. New schools are seeded with Class test,
  Monthly test, Surprise test, Midterm exam and Final exam; an existing "Exam" type is not renamed.
- Timetables carry no personal data of students; the guardians and teachers they notify come from
  existing records. Erasure (docs/17 §4): kept for the life of the school; deleted with the tenant.
- No auto-scheduler, no teacher availability model: that is the later "smart timetable" in
  `docs/modules/core-academic.md` §7.

## Alternatives considered

- **A `calendar_events` table fed by timetable writes.** Rejected for the reason above.
- **Warn on conflicts but allow them.** Schools double-book by accident; the brief asks to prevent it.
- **One row per period per date.** Thousands of rows per class per term for something a weekday
  and a date range already say.
