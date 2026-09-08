# ADR-0009 — Sign in with email and password alone; resolve the school after the password

**Status:** Accepted · **Date:** 2026-09-02

## Context

Tenants resolve from the hostname (ADR-0002, docs/04). A school is reached at `{slug}.<domain>`, and
the API reads the school from the `Host` header. On that address, sign-in has always been email and
password — the school was never asked for, because it was already in the URL.

The problem was the **apex**. Someone who typed the bare domain, or bookmarked it, or was handed the
link by a colleague, reached a page that could not sign them in: the API had no school in which to
look their account up. The first version of that page rendered the form anyway and answered _"that
email or password is not correct"_ for a correct password. That was fixed by asking for the school's
short name first — a field, a Go button, and a redirect.

That fix was correct and the field was still wrong. It asked a person for something they mostly do
not know, in service of a constraint of ours rather than a need of theirs. Nobody thinks of their
school as `beacon-grammar`. A parent who has one email address and one password should type those
two things and arrive.

What could not be given up is the property the field was protecting. **A school picker offered
before authentication is the tenant list handed to anyone who loads the page** — every customer we
have, enumerable by a stranger. docs/09 §2 states that rule and it is not negotiable.

Two facts make "just look the email up" harder than it sounds:

1. **Email is unique per school, not globally.** `users` is keyed `UNIQUE(school_id, email)`, and
   docs/07 §2 says outright that a person at two schools gets two user rows. A parent with children
   at two schools on this platform has two accounts with the same address. There is not always a
   single answer to "which school is this email".
2. **An unauthenticated `email → school` lookup is a cross-tenant enumeration oracle.** Ask it for
   ten thousand addresses and you learn who is a parent at which school. That is worse than the
   picker, not better, because it is silent.

## Decision

**One sign-in form everywhere: email or phone, and a password. The school is resolved from the
credentials, and only after they have been verified.**

### 1. The apex resolves the school from the password, not from the email

`POST /api/v1/auth/login` behaves differently based on the host it arrives on, because that is the
only thing that differs:

| Arrives on        | Behaviour                                                                       |
| ----------------- | ------------------------------------------------------------------------------- |
| `{slug}.<domain>` | Credentials checked against that school. Cookies set. Returns `kind: 'session'` |
| the apex          | Credentials checked against every school. Returns `kind: 'handoff'`             |

Nothing is disclosed before argon2 says yes. A wrong password is the same generic failure it has
always been, and it is the same failure whether the address is registered nowhere, at one school, or
at four.

### 2. When several schools match, the picker appears **after** the password

A person who genuinely holds accounts at three schools with the same email and password sees three
names. That is not the tenant list — it is a list of schools they have just proved they belong to,
and it contains nothing they did not already know. The forbidden thing is offering the list _before_
authentication, and that is still forbidden.

### 3. The handoff, because session cookies are host-only

`COOKIE_DOMAIN` is deliberately unset (docs/04, `config/env.ts`), so a session cookie is bound to
one school's hostname and no other tenant's browser ever transmits it. That property is worth
keeping, and it means **the apex can verify a password but physically cannot issue the session**.

So it issues a bridge instead:

```
apex /login          → POST /auth/login          → verified, no cookies
                     ← { kind: 'handoff', choices: [ { name, slug, continueUrl } ] }
browser              → GET  {slug}.<domain>/auth/continue?t=<token>
school host          → POST /auth/continue       → cookies set, host-only
                     ← 303 to /
```

`auth_handoffs` is a real table, not a self-contained signed token, because **single use has to be
enforceable**: `UPDATE ... WHERE consumed_at IS NULL RETURNING` is atomic, and a stateless token
replayed inside its window is two sessions from one password. The token is 32 CSPRNG bytes, stored
as a SHA-256 hash, valid for **two minutes**, and redeemable once. The school is taken from the
request host and matched against the row, so a token minted for one school cannot be presented at
another's address.

The rejected alternative is `Domain=<apex>` on the session cookie, which would let the apex sign
someone in directly. It also hands one cookie to every tenant subdomain and turns any single
school's XSS into a foothold against all of them. One redirect is cheaper than that.

### 4. Constant work per apex sign-in

Apex sign-in performs **exactly four argon2 verifications**, always — real candidates first, dummy
hashes for the remaining slots. Verifying only the real ones would make the response time count
them: fast means "registered nowhere", slower means "at two schools". That is the same enumeration
oracle by a different route, readable with a stopwatch.

Four fixed verifications also means an unauthenticated endpoint doing four argon2 runs per request,
which is a CPU-exhaustion primitive if left unbounded — so the rate limiter (`RateLimitGuard`) ships
with this, not after it.

### 5. Lockout is not a global existence oracle

At a school's own address, "too many attempts" reveals only that an account exists at a school the
caller already named. At the apex the same message would reveal that an address has an account
_somewhere on the platform_. So the apex uses one message covering both wrong-password and
locked-out, which still tells a genuinely locked-out person the useful thing: wait a few minutes.

Failed attempts at the apex increment the counter on every candidate, exactly as they would at each
school's own address. Sign-in at the apex must not be a way to guess passwords without tripping
lockout.

### 6. `users.email` and `users.phone` get global indexes

The only deliberately un-scoped indexes in the product, registered in `UNSCOPED_INDEXES` with their
reasoning so the structural gate can tell a reasoned exception from a forgotten one. Without them,
an endpoint anyone can call is a sequential scan over every user row on the platform.

## Consequences

- **The school field is gone.** `no-school-in-address.tsx` and `/api/go-to-school` are deleted.
- The school's own address keeps working unchanged, and stays the fast path: one school, one argon2
  verification, no redirect. Links a school sends its parents do not change.
- A new table, `auth_handoffs`, tenant-scoped with RLS like every other (CLAUDE.md). Rows are
  worthless after two minutes and are swept opportunistically on redemption.
- The apex `/login` costs ~200ms of deliberate CPU. It is not a page anyone loads in a loop, and it
  is rate limited.
- **`AuthService` is now the only file that reads users across tenants.** It already was the one
  place `schoolId` is legitimately derived rather than read from context; that concentration is why
  this change touches one service instead of leaking a cross-tenant query into the codebase.

## Alternatives considered

| Alternative                                         | Why not                                                                                                                                  |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Keep the "type your school's short name" field      | Asks for something people do not know. It is our constraint, not their information                                                       |
| A school picker on the login page                   | The tenant list, handed to anyone who loads the page. This is the thing subdomain tenancy exists to prevent                              |
| `email → school` lookup before the password         | Same leak, silent and automatable. Strictly worse than the visible picker                                                                |
| `Domain=<apex>` session cookie, sign in at the apex | One cookie shared by every tenant. Any school's XSS becomes every school's problem. The handoff exists to avoid exactly this             |
| A stateless signed handoff token, no table          | Single use becomes unenforceable. The URL lands in history and referrers, and a replay inside the window is a second session             |
| Make email globally unique instead                  | Forbids a parent with children at two schools, and a teacher at two campuses. ADR-0008 reserves `identity_id` for the opposite direction |
| Verify only the real candidates                     | Response time counts them. An enumeration oracle with a stopwatch instead of a school picker                                             |

## Notes for Phase 9

ADR-0008 reserves `users.identity_id` for one login across the campuses of a group. When that lands,
the picker built here is the surface it plugs into: the difference is that a group identity produces
choices without needing the same password at each campus. Nothing in this ADR blocks that, and the
`choices` array was made a list rather than a single school for exactly that reason.
