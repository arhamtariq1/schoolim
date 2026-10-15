# ADR-0014 — A teacher's scope is the classes assigned to them

**Status:** accepted · 2026-10-16

## Context

`docs/08` §5 says a teacher's `S` (scoped) grants compile into a query clause from
`user_roles.scope`, with `sectionIds` as the example. In practice nothing populated it: the students
service returned an empty scope for every teacher (they saw nothing), and the attendance endpoints
ignored scope entirely (a teacher could read and mark any class, and the staff register).

## Decision

1. **The unit of assignment is the `ClassLevel` (a "class" on screen), not the `Section`.** Sections
   are created per session, so an assignment to one lapses at every rollover. Attendance, the roster
   and the students list already address a class by its level.
2. **Assignments live in `staff_class_assignments`** (tenant table, RLS, `school_id`-leading
   indexes), not in `user_roles.scope` JSON. A real table gives foreign keys, cascade on class
   deletion, a unique constraint, and an index to answer "who takes Grade 5" — none of which a JSON
   column does. `user_roles.scope` is left for scopes that are not relational.
3. **One resolver, `ClassScopeService`**, turns a grant into `string[] | undefined`
   (`undefined` = all, `[]` = nothing). Every consumer applies it **in the query**, never after the
   fetch. Anything unclear fails closed.
4. **Out-of-scope answers "not found"**, the same as a missing row (docs/16 §7).
5. **The staff register is not a class's.** New permissions `attendance.staff.read|create` replace
   the reuse of `attendance.record.*` for the staff routes; teachers hold neither.
6. Routes with no row to narrow (the guardian directory) use `@RequireUnscopedPermission`.

## Consequences

- A teacher assigned Grade 5 sees every section of Grade 5. Per-section assignment is a later
  refinement: add `section_id NULL` to the table; the resolver's contract does not change.
- A teacher with no assignments sees nothing. That is intended; the staff form says so.
- Student detail still includes the child's fee summary for a teacher. Hiding it is a separate
  decision about the student profile, not about class scope.

> The migration's header comment calls this ADR-0016; it is an applied migration and is not edited.
