# Super Admin Console — build plan

Implements `super-admin.md`. Same `@ilm/ui` components and theme as the portal; no new libraries.

## Assumptions (change by editing this file)

- Plans are editable data. No prices are hardcoded (decision D2 is open).
- Scope: Phases A–C first; D and E after review.
- MFA is Phase E. Invoices are recorded and printable, not emailed.

## Current state

Admin has login, a schools list and "Add school". API has list / slug-available / create / session.
No status-change or edit routes, no plans, no platform audit table, no MFA, no impersonation.
A SUSPENDED school is already read-only (tenant guard); CHURNED cannot sign in.

## Phases

### A — Shell and real school list

- [x] App shell (sidebar, header, theme toggle, sign-out), nav filtered by capability
- [x] Schools list: search, status filter, sort, pagination
- [x] Overview: counts by status, trials ending in 7 days, recent signups
- [x] Loading / empty / error / permission-denied on every screen

### B — School detail and controls

- [x] `platform_audit_logs` (append-only, no school scope); every platform mutation writes it in-transaction (done with Plans)
- [ ] `/schools/[id]` tabs: Profile, Users, Activity
- [ ] Edit profile (slug immutable); force password reset; disable user
- [ ] Change status with typed confirmation and mandatory reason

### C — Plans and subscriptions

- [x] Plans CRUD in the console ("Plans & pricing"), archive/restore, one highlighted plan, audited
- [x] Public `GET /public/plans`; landing page pricing reads it (30s cache); fallback when none or unavailable

- [ ] Tables: `plans`, `subscriptions`, `invoices`, `subscription_payments` (money as `*Minor`, append-only)
- [ ] Change plan, extend trial, record manual payment (idempotency key), void invoice by reversal
- [ ] School status derived from the subscription lifecycle
- [ ] Portal `/settings/billing` becomes a read-only mirror

### D — Usage, limits, features (nightly keyed job, graduated cap 80/100/110%, feature toggles, announcements)

### E — MFA, impersonation, cross-school audit search, job monitor, platform-user management

## Edge cases

- Dunning never deletes data: past due → read-only → suspended.
- Status changes are conditional on current status (no lost updates between operators).
- Money is integer paisa; invoices and payments are reversed, never edited.
- Trial extension only moves `trialEndsAt` forward.
- SUPPORT read-only; BILLING subscriptions only; SUPER_ADMIN creates/suspends. Enforced server-side, hidden client-side.
- Lists show counts, never tenant records (docs/17 §5).
- No school-specific code; plans and flags are configuration.
