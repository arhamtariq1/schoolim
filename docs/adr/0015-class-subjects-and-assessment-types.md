# ADR-0015 — Subjects and assessment types belong to a class

**Status:** accepted · 2026-10-16

## Context

Subjects and assessment types began as the school's own lists, and every teacher saw every one
when entering marks. Schools do not teach every subject in every class, and the people who decide
what a class has are the office and the principal — not the teacher entering marks.

## Decision

1. **Names stay school-wide** (`subjects`, `assessment_types`), so a name is spelled once and
   renaming it renames it everywhere.
2. **Which a class uses is a link** (`class_subjects`, `class_assessment_types`), managed from the
   class page by holders of `exams.setup.manage` (owner, principal, admin, office staff).
   **Teachers do not hold it**: they read what their class has, through the marks form.
3. **Marks follow the class.** The entry form loads only the selected class's subjects and types,
   and the API refuses a subject or type the class does not have — the dropdown is not the guard.
4. **Removing is refused while the class has tests using the item**, so no result loses its
   subject. Existing assessments were carried over by the migration, so no class lost access to
   marks it already had.
5. Typing a new name that already exists reuses that subject rather than failing.

## Consequences

- A new class has no subjects and no types, so teachers cannot enter marks until the office sets
  it up. The form says so and points at the class page. That is deliberate: guessing a default
  list for every class is the school-specific assumption we are avoiding.
- Teachers cannot open the class page (it needs `academics.structure.read`); their view of a
  class's subjects and types is the marks form.
