# ADR-0025 — Schools customise access per role and per person

**Status:** accepted · 2026-10-26

## Context

Permissions were a fixed matrix in code (`roles.ts`, docs/08 §4). Schools asked to go beyond it:
give a role, or one particular teacher, a screen the defaults do not include, and take away screens a
person does not need. R1 rules out per-school code, so this has to be configuration.

## Decision

1. **The defaults stay in code.** A school stores only the _difference_: `role_permission_overrides`
   (per role) and `user_permission_overrides` (per person), each a list of `GRANT`/`REVOKE` rows.
   "Reset to default" is deleting the rows. Permission names are text, and a name the code no longer
   declares is ignored on read.
2. **Resolution order:** each held role's default → that role's school change → combine roles (`all`
   beats `scoped`) → the person's change, applied last. One pure function, `resolveGrants` in
   `@ilm/contracts`, used by the API and the screen.
3. **A grant never upgrades.** Granting something a person holds `scoped` (a teacher's own classes)
   leaves it scoped. A grant only adds what was absent, as `all`: there is no scope to narrow a
   permission the role never had.
4. **Resolved once per request.** `TenantGuard` loads the overrides and stores the result in CLS;
   `RbacGuard`, `ClassScopeService` and every service that branched on `grantFor(roles, …)` now ask
   `TenantContextService.grantFor`. The session's `permissions` (the shell's navigation) uses the same
   function. Not cached: a removed permission must stop working on the next click.
5. **Who may change what — no self-promotion:**
   - The screen needs `settings.user.manage`, unscoped.
   - Changes go **downward only**, by rank (OWNER › PRINCIPAL › ADMIN › the rest): nobody edits their
     own role, their own account, or a peer's.
   - A permission newly given must be one the giver holds `all` themselves.
   - OWNER, STUDENT and PARENT are not customisable. The owner always keeps full access, so any
     change can be undone; parents' screens begin at their own children and must never receive a
     staff grant.
   - Locked, never customised: `dashboard.workspace.read`, `workflow.request.create`, `parent.*`,
     `settings.billing.manage`.
6. **Audited** with the whole before and after set, in the same transaction as the write.

## Consequences

- One extra tenant query per authenticated request for anyone holding a customisable role. Both
  tables are tiny and indexed by `school_id` first. If it ever shows up in a profile, cache per school
  with invalidation on write; until then, correctness beats a cache.
- Notification and request routing still pick recipients by **role default**
  (`hasPermission([role], …)`), so a teacher granted `workflow.request.manage` can manage requests
  but is not notified of new ones. Fixing it means resolving per user at fan-out time.
- The RBAC matrix suite (docs/08 §8) still tests the defaults. A school's customisation is tested in
  `src/e2e/access.e2e.test.ts`.
- Erasure: person rows cascade with the user and the tenant; role rows are configuration and go with
  the tenant. The audit trail follows `audit_logs` retention.
