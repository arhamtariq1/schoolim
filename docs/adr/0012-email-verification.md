# ADR-0012 — Verify the owner's email at signup, and nag rather than block

**Status:** Accepted · **Date:** 2026-09-02 · **Closes a gap opened by:** ADR-0010

## Context

ADR-0010 shipped self-serve signup and listed this as one of three things it knowingly left undone:
_"No email verification. The owner's address is unverified, so a typo means a school nobody can
reset a password for."_

That is worth restating without the shrug, because it is the sharpest edge in the self-serve flow.
**The owner's email is the only route back into a self-serve tenant.** There is no operator to
telephone, no account manager, no out-of-band password handover — those all disappeared with
ADR-0010, deliberately. So a school whose owner mistyped their own address at 11pm is one forgotten
password away from being permanently locked out, with its students' records inside it. The support
outcome is a manual database edit by whoever is on call, performed for a person whose identity
cannot be checked.

There is a second, smaller reason: unverified signup means unlimited tenants at invented addresses,
bounded only by a per-IP rate limit.

## Decision

**Send a confirmation link at signup. Record when it is followed. Do not block anything on it yet.**

### 1. It does not gate sign-in, and it does not gate the trial

ADR-0010's argument for creating the school immediately — _a dead end between intent and product is
where trials go to die_ — did not stop being true when verification arrived. The person is signed in
the moment they sign up, exactly as before; they simply arrive to a banner.

Verification will gate **trial conversion**, in Phase 5, alongside the rest of the billing
machinery. That is the first place a gate has anything behind it. A gate today would be theatre, and
this ADR would rather say so than invent enforcement.

**What that means honestly: today, verification buys a nag and a working password reset.** That is a
smaller claim than "we verify emails" usually implies, and it is the true one.

### 2. Confirmation is a token, not a session

The link signs nobody in. Proving you can read an inbox is not proving you know a password, and a
link that did both would turn "someone left their email open on a shared computer" into a session.
Whoever follows the link lands in whatever state their browser was already in.

It is `@Public` for the opposite reason: the person following it is on a phone, two days later, in a
browser that has never seen the site. Requiring a session would make the common path "click link →
login page → lose the token".

### 3. Same token discipline as the sign-in handoff, with one addition

Single use, hashed with SHA-256, scoped to the school whose hostname it arrives on, claimed
atomically with `UPDATE ... WHERE consumed_at IS NULL`. Issuing a new one supersedes any outstanding
ones, so the most recent link is the one that works — which is what everyone assumes anyway.

**Superseding happens on delivery, not on issue**, and the ordering is load-bearing rather than
incidental. Retiring the old token first and then failing to deliver its replacement leaves the
person holding nothing: the link in their inbox is dead and the new one never arrived — and the way
out is the "Send again" button, on a path they reached precisely because sending is already failing.
So an already-delivered link keeps working until a replacement actually reaches them. There is a
regression test named for this.

**Lifetime is 24 hours, not the handoff's two minutes.** A browser redeems a handoff instantly; a
human reads email on their own schedule. Resending is free.

The addition is `email_verifications.email`: the address the token was **sent to**, copied rather
than joined. Somebody can change their address between a link being sent and clicked, and a token
checked against whatever the user row says at redemption time would cheerfully mark an address
verified that nobody ever proved control of. Redemption compares the two and refuses when they
differ.

### 4. `email_verified_at` is a timestamp

Not a boolean. "When did they confirm?" is the question asked in a dispute, and `true` cannot answer
it. It costs the same to store.

Existing accounts are backfilled as verified in the migration. Every user row that predates this was
created by an operator who had already spoken to the person and handed over a password out of band —
a stronger proof than an email round trip. Marking them unverified would put a nag in front of
schools that never received a message to confirm, and open the seeded demo on a banner.

### 5. Resending takes no email address

`POST /auth/resend-verification` requires a session and mails the signed-in account's own address.
The endpoint's _signature_ is the defence: there is no field to put a stranger's address in, so it
cannot become an existence oracle or a way to post mail at people.

The 60-second cooldown is per **recipient**, not per caller — the rate limiter counts requests per
IP, and the thing being rationed here is somebody's inbox.

### 6. Every failure is one message

Expired, already used, wrong school, address-since-changed: all render as _"That confirmation link
has expired. Ask for a new one from your dashboard."_ The next step is identical in every case, so
distinguishing them only invites the reader to wonder which one they hit.

## Consequences

- One new table, `email_verifications`, tenant-scoped with RLS and registered in `TENANT_MODELS`
  (CLAUDE.md). One new column, `users.email_verified_at`.
- `SessionUser` gains `emailVerified: boolean` — a boolean, not the timestamp, because the shell is
  deciding whether to render a banner and the exact moment is an audit question.
- The banner is **not dismissible**. A dismiss control on a message this consequential is a way of
  losing the message; it goes away when the thing it asks for is done, which is the only honest way
  for a banner to disappear.
- **Deliverability is now a product risk.** Mail sent from a consumer Gmail account without SPF/DKIM
  alignment lands in spam often (ADR-0011). The banner copy says "check the spam folder" because
  that is where the first message from a new sender usually is. A registered domain fixes this and
  is blocked on D4.
- Signup is slower by one SMTP round trip. It happens after the transaction commits, so it delays
  the response without holding a database connection.
- **Retention:** these rows are worthless within 24 hours and are swept on the redemption path. They
  fall with the school under the ordinary tenant policy (docs/17 §4); nothing in them outlives the
  account.

## Alternatives considered

| Alternative                                    | Why not                                                                                                                                                                            |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verify **before** creating the school          | Rejected in ADR-0010 and still rejected. A dead end between intent and product is where trials die, and it needs somewhere to park pending signups and a story for abandoned slugs |
| Block sign-in until verified                   | Same objection, plus it strands anyone whose message went to spam — which, on the current sender reputation, is a lot of people                                                    |
| Verify by emailing a 6-digit code              | Better on a phone, worse everywhere else, and it needs a screen to type it into. Worth revisiting if link deliverability turns out to be the problem                               |
| Let the link also sign the person in           | Turns an open inbox into a session. The convenience is real and the trade is bad                                                                                                   |
| A public "resend to this address" endpoint     | An existence oracle and a way to send mail at strangers, in one endpoint                                                                                                           |
| Make the banner dismissible                    | A way of losing the one message that prevents an unrecoverable account                                                                                                             |
| Skip it until Phase 5 with the rest of billing | The gap is not billing-shaped. It is "this tenant may already be unrecoverable", and it accrues from the first real signup                                                         |
