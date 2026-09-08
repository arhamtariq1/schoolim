# ADR-0010 — Self-serve signup with a 30-day trial

**Status:** Accepted · **Date:** 2026-09-02

## Context

Until now a school existed in this system because an operator created it. `SchoolsService.create`
lives behind the platform console, generates a temporary password, and hands it over out of band.
docs/19 §6 describes the motion that assumes: demo → quote → terms accepted → school created, trial
starts. Sales-led, with a person in the loop at every step.

The instruction is to add a public landing page with packages, and a signup that creates the school
and starts a free month with nobody in the loop. That is a **business-model change**, not a feature:
the first contact the business has with a school may now be a row written at 2am.

It is the right change for this product and this market. docs/01 §5 already commits to "a new school
is onboarded end-to-end in under 10 minutes with zero engineering involvement", and docs/02
identifies **self-serve configuration** as the competitive wedge — most competitors configure fee
structures _for_ you, which is a services business wearing a SaaS costume. A signup form that needs
a phone call contradicts the thing being sold.

It is worth being explicit about what a stranger creating a tenant costs, because the answers are
what this ADR mostly consists of:

- Nobody attests to what the school agreed to.
- The subdomain — permanent, and shadowing real infrastructure hosts if chosen badly — is picked by
  someone we have never spoken to.
- The endpoint is reachable by everyone on the internet and writes rows.
- Phase 5 owns subscriptions, plans and invoicing (docs/14). This lands well before Phase 5.

## Decision

**Ship self-serve signup now, as a thin slice: the tenant, the owner, the trial, and the terms
record. Not billing.**

### 1. `POST /api/v1/public/signup` — one transaction

School, owner user, `OWNER` role, terms acceptance and the audit row are one transaction or none of
it. A school created without an owner is a tenant nobody can sign into, and the only way to find out
is a support ticket. The school is `status = TRIAL` with `trial_ends_at = now + 30 days`;
`TRIAL_DAYS` is one constant in `@ilm/contracts`, so the trial length is not a number written in
three places.

The owner's password is theirs and `must_change_password` is **false**. Forcing an immediate change
is the ritual that follows an operator handing over a temporary password, and there was no operator.

Signup ends in a handoff (ADR-0009), so the owner lands inside their own portal without retyping the
password they chose thirty seconds ago.

### 2. `school_agreements` ships now, not in Phase 5

docs/17 §3 specifies it and docs/19 §6 calls it "the piece that does not exist yet", scheduled with
the subscription module. **Self-serve moves it forward, because self-serve is what removes the human
who could reconstruct it.** If the tick box is not recorded when it is ticked, "did this school
accept the DPA, and which version?" becomes permanently unanswerable — and that is the question that
matters most on the day it is asked.

`acceptedTerms` is a literal `true` in the zod schema, not a boolean. A checkbox that can be false
is a checkbox that gets a default, and a defaulted acceptance is not an acceptance. The accepter's
name and email are **copied into the row, not joined** — the user can be renamed, reassigned or
erased under the retention policy, and the acceptance must outlive all three and still say who
signed.

Retention, per CLAUDE.md's question: erased with the school, seven years after the contract ends. It
is the evidence for the contract, so it outlives the tenant's operational data rather than being
anonymised alongside it. The application role holds `SELECT, INSERT` and no `DELETE`.

### 3. Reserved slugs move to `@ilm/contracts`

`api.<domain>` and `admin.<domain>` are real hosts. A school claiming one would shadow them, and now
the person choosing is a stranger rather than an operator. `RESERVED_SLUGS` moves out of
`SchoolsService` into the contracts package because **three** callers need the identical answer: the
form checking as someone types, the endpoint checking before it writes, and the console creating a
school by hand. It grows to cover the apex's own routes — `signup`, `pricing`, `login`, `welcome` —
which did not exist as routes until this ADR.

### 4. `GET /api/v1/public/slug-available` is an enumeration oracle, and that is accepted

`platform.ts` previously carried a note on this schema saying it must never appear on a public
route, "that is what would hand over the customer list". That note is now wrong and has been
corrected in place rather than left to quietly become false.

The honest position: a signup form that cannot say "taken" before submission is a signup form people
abandon, every subdomain SaaS has this endpoint, and what it discloses — that a school with a given
short name exists — is the same fact anyone learns by loading that address and seeing a login page.
It returns yes or no and nothing else: no name, no status, no date. It is rate limited. It does not
disclose _which email belongs to which school_, which is the leak that actually matters and which
ADR-0009 spends most of its length preventing.

### 5. A rate limiter, shipped with the endpoints

`RateLimitGuard`: fixed window, in memory, first in the guard chain — ahead of authentication,
because the endpoints that need it are the ones with no session, and a limiter behind `AuthGuard`
would protect everything except the surface it was added for. Signup is 10/hour per address and the
slug check is 60/minute.

Sign-in is 100 per five minutes, which is deliberately loose and worth explaining: a school of 500
parents sits behind one NAT, so a tight per-IP limit would lock out a whole school at 8am. The limit
is set where automated abuse lives and ordinary bursts do not. Password guessing is defended by
account lockout after eight consecutive failures, which is per account rather than per address; this
limit exists for the CPU cost of ADR-0009's four fixed argon2 verifications.

**It is in-memory and therefore per-instance.** That is honest for one instance and wrong the moment
there are two. It moves to Redis — already a dependency, docs/05 — before the API is scaled
horizontally, and the interface does not change when it does.

### 6. The apex becomes a public website

`src/proxy.ts` (Next 16's renamed middleware) splits one deployment into two sites: the apex serves
the landing page, packages, signup and sign-in; a school's hostname serves the portal and none of
those. Doing this in one place rather than per page is what keeps it honest — a page that has to ask
"am I on the apex?" is a page that will one day forget to.

## Consequences

- **docs/19 §6 no longer describes the only path to a customer.** It describes the sales-led path,
  which still exists for group deals and anything with a negotiated price. Self-serve is the second
  path and the default one. §6 is updated rather than replaced.
- **Pricing is still decision D2 (docs/15), and the landing page now displays numbers.** The figures
  in `PACKAGES` are placeholders in one constant, with the constraint written above them: they must
  not go in front of a real customer before D2 closes, and docs/19 §5 has the cost floor that has to
  be cleared first. **This is the one loose end this ADR knowingly leaves.**
- **Trial expiry is not enforced yet.** `trial_ends_at` is set and nothing reads it. The dunning
  state machine — trial → past due → suspended read-only → churned — is Phase 5 and unchanged by
  this. Until it lands, a trial that ends does nothing, which is the safe direction to fail.
- **No email verification.** The owner's address is unverified, so a typo means a school nobody can
  reset a password for. It is on the Phase 5 list with password reset, which needs the same mail
  infrastructure. Worth knowing before the first real signup, and worth not blocking this on.
- Two new tables, both tenant-scoped with RLS and registered in `TENANT_MODELS` (CLAUDE.md).
- The platform console's school creation is unchanged and still the right tool for an operator
  setting up a school on the phone.

## Alternatives considered

| Alternative                                         | Why not                                                                                                                           |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Keep sales-led onboarding only                      | Contradicts docs/01 §5 and the docs/02 positioning. A product that needs a phone call to try is a services business               |
| Signup creates a "lead", an operator provisions it  | The trial is the demo. A day's delay between wanting to try and being able to is where trials go to die                           |
| Defer `school_agreements` to Phase 5 as planned     | Self-serve is precisely what removes the person who could reconstruct it. It has to ship with the thing that creates the gap      |
| Email verification before the school is created     | A dead end between intent and product, for a mistake that is rare and fixable. Needs mail infrastructure this phase does not have |
| No slug availability check, fail on submit          | Ten fields filled in and thrown away over the one field they cannot see the state of                                              |
| Ship without a rate limit, add it after an incident | The endpoint writes tenant rows and, via apex sign-in, runs four argon2 hashes per call. Not a limit to add later                 |
| Redis rate limiting now                             | A second runtime dependency in the request path for one instance. The in-memory version is honest about what it is                |
