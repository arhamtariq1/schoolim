# ADR-0008 — School groups: the campus is the tenant, the group is a layer above it

**Status:** Accepted (reservation applied now, feature built in Phase 9) · **Date:** 2026-08-22

## Context

A meaningful share of the target market is not a single school. Pakistani chains run 2–25 campuses
under one brand: Model Town / DHA / Gulberg. They ask for two things at once:

1. A **group administrator** who logs in once, sees consolidated numbers across every campus, and
   can act inside any of them.
2. A **campus administrator** who sees only their campus and cannot see the others' fees, staff or
   students.

That is a tree — group → campus → section — and the current model has only the bottom two levels.
Nothing in the schema today expresses "these three schools are one organisation". Worse, the current
identity rule (`users.school_id` with `UNIQUE(school_id, email)`, and the explicit note that "a
person at two different schools gets two users") means a group admin would need three separate
logins with three separate passwords. That is a product failure, not an inconvenience.

Competitors treat this as a headline feature: Classter, Campusless, Skoola and ScholaBook all
advertise group/branch role hierarchies with per-branch scoping and group-level rollup reporting,
and Campusless states its typical customer runs 3–25 campuses on one deployment. Being unable to
answer "can head office see all four campuses?" loses the largest deals in the market.

The decision is _where the tenant boundary sits_, and it must be made before the first migration
because RLS policy shape is expensive to change on a live database.

## Decision

**A campus is a tenant. `schools` = one campus. A group is a layer above tenancy, never a
replacement for it.**

Four changes; three are reserved now at effectively zero cost, one is built in Phase 9.

### 1. Reserve the group in the schema now (Phase 0 migration)

```
school_groups   id, name, slug UNIQUE, legal_name, logo_url, primary_color,
                billing_mode(PER_CAMPUS|CONSOLIDATED), status, created_at
schools         + school_group_id uuid NULL REFERENCES school_groups(id)
users           + identity_id uuid NULL
```

Nullable, unused, and unreferenced by any code until Phase 9. A standalone school has
`school_group_id = NULL`. Joining a campus to a group later is one `UPDATE`; selling a campus out of
a group is one `UPDATE` back to `NULL`. No data ever moves.

### 2. Write the RLS policy in its array form from migration #1

```sql
-- not this
USING (school_id = current_setting('app.current_school_id', true)::uuid)

-- this, from the very first migration
USING (school_id = ANY (string_to_array(
         current_setting('app.current_school_ids', true), ',')::uuid[]))
```

For a single-campus request the array holds exactly one id, and the planner still reduces it to an
index lookup on the `school_id`-leading index. This is the load-bearing part of the ADR:
retrofitting the policy shape across every tenant table on a live production database is the one
part of multi-campus that cannot be done cheaply later. Writing it this way today costs nothing.

The array is populated by `TenantGuard` from campus memberships **proved by the token**, exactly as
the single value is today. The trust boundary does not move.

### 3. One identity, many campus users (Phase 9)

A platform-level `identities` table (email, password hash, MFA secret, token version) owns N campus
`users` rows through `users.identity_id`. Login authenticates the identity; the token carries the
list of campuses it may enter; the existing role switcher becomes a **campus switcher**. Campus
`users` rows keep `school_id` — tenant isolation is untouched.

### 4. Group context is read-only; every write happens in exactly one campus

This is the rule that keeps the whole thing tractable:

- **Reads** may span campuses when the token proves group membership and the request carries a group
  permission (`group.report.read`). The RLS array is set to those campuses.
- **Writes** always run with an array of exactly one campus. Audit rows, `number_sequences`,
  vouchers, receipts and payments therefore never need to know that groups exist.
- Head office does not own operational data. It owns **templates**. A group-defined fee head or
  grading scale is distributed to a campus as a normal campus-owned row flagged `managed_by_group`,
  which the campus can use but not edit. Nothing a campus needs to run its day is stored at the
  group.

### 5. Roles

`GROUP_OWNER`, `GROUP_ADMIN`, `GROUP_ACCOUNTANT` are granted on `school_groups`, not on `schools`.
They grant campus roles by implication, and the permission string namespace extends to
`group.{resource}.{action}`. The three-level scope hierarchy — group → campus → section — reuses the
existing `user_roles.scope` mechanism; only the group level is new.

### 6. What is _not_ a campus

A separate campus (and therefore a separate tenant) only when **all four** are true:

1. its own fee collection and bank account,
2. its own principal or head answerable separately,
3. its own staff payroll,
4. its own P&L that the owner reads separately.

Boys/girls wings, morning/evening shifts, and primary/secondary blocks on one premises are **not**
campuses. They are a dimension inside one campus (a `wing` / `shift` attribute on class levels and
sections). Over-splitting forces head office to reconcile across tenants what is really one ledger;
under-splitting puts two principals on one fee ledger. Both are expensive, so the rule is written
down here and applied at onboarding, by the Super Admin app, not by the customer's guesswork.

### 7. Billing

Subscriptions stay per campus (`subscriptions.school_id`). `school_groups.billing_mode` selects
whether the group receives one consolidated invoice or one per campus. Group pricing is a discount
on a count of campuses, not a different product.

## Consequences

**Gained**

- Campus isolation stays **database-enforced**, not merely application-enforced. A scoping bug leaks
  nothing across campuses because RLS still refuses the rows.
- A campus can be sold standalone today and joined to a group later with one nullable FK — no
  migration, no downtime, no data movement. Groups can also be split.
- Blast radius of any bug, bad batch job or bad migration remains one campus.
- Hot tables (`attendance_records`, `fee_vouchers`) keep their natural per-campus locality on the
  `school_id`-leading index and the monthly partitioning.
- The largest deals in the market become answerable.

**Paid**

- Cross-campus reporting is a deliberate, separate read path with its own permission and its own
  tests — it is not free the way it would be if the group were the tenant.
- Data genuinely shared across campuses (a teacher who teaches at two, a student who transfers) is
  modelled as a link plus a transfer operation, not as one row seen from two places.
- Group-level uniqueness (a single admission-number series across all campuses) is not available;
  numbering is per campus with a campus prefix. This is what chains do on paper anyway.
- ~2–3 weeks in Phase 9 for the group console, plus the identity migration.

**Cost of the reservation itself: one table and two nullable columns, none of them read by any code
until Phase 9.**

## Alternatives

- **Group is the tenant, `campus_id` on every table.** Rejected. Campus isolation would fall back to
  application-level scope, losing the RLS backstop that is the whole reason for `ADR-0002`. Every
  single-campus customer — the first fifty — would pay for a degenerate one-campus group. A
  15-campus group's every query would range over all campuses' rows.
- **A database per campus.** Rejected for the reasons in `ADR-0002`; migrations across dozens of
  databases is the failure mode that kills small teams.
- **Do nothing until a chain actually signs.** Rejected only for items 1 and 2. Item 2 in particular
  cannot be deferred: rewriting the RLS policy on every tenant table of a live database, under
  deadline pressure, to win a deal already in progress, is the exact situation this document exists
  to prevent.

## Related

`ADR-0002` (shared-schema RLS multi-tenancy) · `docs/04-multi-tenancy-and-security.md` ·
`docs/07-data-model.md` §1 · `docs/08-rbac-and-roles.md` §2 · `docs/14-roadmap-and-phases.md` Phase
9
