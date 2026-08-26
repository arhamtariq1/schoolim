# Module — Super Admin Console (Phase 5)

`apps/admin` — a separate Next.js application, separate user table, separate cookie, separate API
namespace (`/api/v1/platform/*`). Only you and (later) support staff use it.

---

## 1. Why it is a separate app

A bug in the school portal must not be able to reach platform capability. Different app, different
token type, different guard. `PlatformGuard` rejects any token whose `typ !== "platform"` before any
handler runs. This costs a day of setup and removes an entire class of catastrophic failure.

**MFA is mandatory for every platform user.** No exceptions, from day one.

---

## 2. Screens

### 2.1 Overview

- Schools: total, active, trial, past due, suspended
- MRR / ARR, new this month, churned this month, net revenue retention
- Total students and staff across the platform (your real scale metric)
- System health: API p95, error rate, queue depth, failed jobs, DB size and connections
- Recent signups, recent failures, expiring trials in the next 7 days

### 2.2 Schools

List with: name, slug, plan, status, students, storage, last activity, MRR.

**School detail** — everything you need to answer a support call without asking the customer:

| Tab          | Content                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| Profile      | Name, slug, domains, timezone, contacts, branding                                                        |
| Subscription | Plan, cycle, period, invoices, payment history, change plan, extend trial                                |
| Usage        | Students vs cap, staff, storage, messages sent, vouchers generated, API calls — with 12-month sparklines |
| Users        | All users and roles; force password reset; disable a user                                                |
| Features     | Per-module toggles (`school_features`)                                                                   |
| Activity     | Last login per role, DAU, most-used screens — tells you if they are actually adopting                    |
| Data         | DB row counts by table, export full data, schedule offboarding                                           |
| Support      | Impersonate, notes, ticket history                                                                       |
| Danger       | Suspend, unsuspend, delete (two-step, 30-day grace, typed confirmation)                                  |

### 2.3 Onboarding a school — target: under 10 minutes, zero engineering

A wizard:

1. School details (name, slug, contacts, timezone, currency)
2. Plan and trial length
3. Owner account → invitation email
4. Seed defaults (see `07-data-model.md` §13) — class levels, fee heads, expense categories, leave
   types, message templates, number sequences
5. Optional: import students from Excel right there
6. Done → a live URL and credentials to hand over

**A demo tenant generator is part of this.** One click creates a school with 300 realistic students,
a full year of attendance, fee history and staff — for sales demos and for load testing. Build it in
Phase 1, not Phase 5; you will use it every week.

### 2.4 Plans & subscriptions

- Plan CRUD: name, student cap, price, billing cycle, included features, message quota
- Subscription lifecycle: trial → active → past due → suspended → churned, with automated dunning
- Invoice generation, payment recording (manual in v1 — you will collect by bank transfer), and a
  per-school billing history
- **Grace behaviour on non-payment:** read-only mode first (they can still see their data and print
  vouchers), then suspension. Never delete or hard-lock a school's data over an unpaid invoice —
  that is how you get a reputation you cannot recover from.

### 2.5 Impersonation (support)

- Reason is mandatory and stored.
- Read-only by default; write access requires a second explicit confirmation.
- 30-minute expiry.
- The school sees a persistent banner while it is active.
- Start, end and every action are written to `platform_audit_logs` **and** the school's own
  `audit_logs`, so the school can see what you did.

### 2.6 Platform operations

- **Feature flags:** global, per-plan, or per-school. This is the mechanism that lets one school get
  something without a code branch.
- **Announcements:** a banner or in-app message to all schools, or a segment.
- **Job monitor:** BullMQ dashboard — queue depth, failures, retry, dead-letter inspection. Voucher
  generation failing silently is a business-ending event; watch it.
- **Audit search:** across tenants, by actor, entity, action, date.
- **Migration status:** which schema version each shard is on.
- **Error feed:** Sentry issues grouped by school, so you see "school X is generating all the
  errors".

---

## 3. Usage metering

A nightly job writes `usage_snapshots` per school: active students, staff, storage bytes, vouchers
generated, messages sent. This drives billing, plan-limit enforcement, and the health view.

**Limit enforcement is graduated, never abrupt:**

1. 80% of the student cap → in-app notice to the school owner
2. 100% → a banner and an email; new admissions still succeed
3. 110% → new admissions blocked with a clear upgrade path

Blocking a school from admitting a student mid-admission because of your billing logic is how you
lose a customer. Warn early, block late, never lose their data.

---

## 4. Platform API surface

```
/api/v1/platform/schools                  CRUD, suspend, restore, seed, export
/api/v1/platform/schools/:id/impersonate  POST → short-lived tenant token
/api/v1/platform/plans                    CRUD
/api/v1/platform/subscriptions            lifecycle, invoices
/api/v1/platform/features                 flags
/api/v1/platform/usage                    snapshots and aggregates
/api/v1/platform/audit                    cross-tenant audit search
/api/v1/platform/health                   metrics, jobs, queue depth
```

All behind `PlatformGuard` + `PlatformRoleGuard`. These routes run with the RLS-bypassing
`DATABASE_ADMIN_URL` connection — the only place in the codebase that does — and every one of them
writes an audit entry.

---

## 5. Definition of done for Phase 5

- [ ] A school is onboarded end-to-end in under 10 minutes with no engineering involvement
- [ ] Demo tenant generator produces a realistic 300-student school in one click
- [ ] Impersonation is audited on both sides and shows a banner in the school portal
- [ ] Subscription states drive real behaviour (read-only mode actually works)
- [ ] Usage snapshots run nightly and feed both billing and plan limits
- [ ] MFA enforced for every platform user
- [ ] No platform endpoint is reachable with a tenant token (tested)
