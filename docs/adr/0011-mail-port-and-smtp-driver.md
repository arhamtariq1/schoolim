# ADR-0011 — `MailPort`, with SMTP as the first driver instead of Resend

**Status:** Accepted · **Date:** 2026-09-02 · **Amends:** docs/05, docs/13

## Context

The product had no way to send an email. That was fine while every account was created by an
operator who handed over a password in person; ADR-0010 ended it, because a self-serve tenant's
owner is somebody we have never spoken to and can only reach by email.

docs/05 already chose: **"Resend behind a `MailPort` interface"**, with the reasoning "3k/mo free;
swap to SES later without touching callers". Two separable decisions are packed into that line, and
only one of them is architectural.

Meanwhile the immediate constraint is concrete. The account available today is a Gmail account with
an app password, and no domain has been registered — D4, the product name, is still open, so there
is no `@ourdomain` to authenticate as, and Resend requires a verified sending domain before it will
deliver anything.

## Decision

**Keep the interface. Change the first driver.**

### 1. `MailPort` is the decision that mattered, and it stands

One interface — `send(message): Promise<MailResult>` — that every outbound message goes through. A
service that sends mail never learns what carried it. The driver is selected once at boot from
`MAIL_DRIVER` and injected as `MAIL`.

### 2. The first driver is SMTP (nodemailer), not Resend

|                              |                                                                                                                                                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Works today**              | An app password and a host. Resend needs a verified domain, and the domain waits on D4                                                                                                                   |
| **Same path in development** | mailpit on `localhost:1025` is SMTP too, so "it worked locally" means something. A provider SDK plus a local mock is two code paths, and the one that runs in development is the one that is never wrong |
| **Not a lock-in**            | The provider is a config value. Resend, SES and Postmark all speak SMTP anyway, so even switching provider may not mean switching driver                                                                 |

### 3. `log` is the default driver, and tests force it

`MAIL_DRIVER` defaults to `log`, which sends nothing and records the subject and the recipient's
**domain** — never the body, because the body of a verification email contains a working token and a
token in a log file is a credential in a log file.

Defaulting to "send nothing" is deliberate. A half-configured deployment should fail to send rather
than send successfully from whatever identity happens to be lying around; the first is recoverable
and the second is not.

`apps/api/src/testing/load-env.ts` pins `MAIL_DRIVER=log` unconditionally, overriding `.env`. The
e2e suite signs up schools repeatedly at addresses like `founder@signup-e2e.test` that do not exist.
Against a real relay every run would push a burst of undeliverable mail through it — which, on a
consumer account, is how the account gets rate-limited, and the symptom would surface days later as
"signup is broken".

### 4. Sending never fails the caller's work

Every implementation resolves rather than throws, and reports the outcome in its return value.
Signup calls the mailer **after** its transaction has committed and outside it: sending inside a
transaction holds a database connection open for the length of an SMTP conversation, and a relay
that hangs would roll back a school that is otherwise perfectly created. Callers may act on a
`false`; none may treat it as fatal.

### 5. The `From` display name comes from `BRAND`, not from configuration

`MAIL_FROM` carries the address; the mailer wraps it as `${BRAND.name} <addr>`. Renaming the product
(D4) then changes the From line of every email without anyone remembering to edit an environment
variable — which is the D4 containment rule in CLAUDE.md applied to the one place it would otherwise
leak into configuration.

### 6. Templates stay in the API until there are four of them

docs/05 reserves `packages/email` for React Email templates shared by the API and a preview app.
That package earns its keep at about the fourth template. This is the first. Standing up a package,
a build step and a preview harness for one message is cost with no return; moving one function later
is cheap.

## Consequences

- **Gmail is a stopgap and must not be the production answer.** Stated plainly because the
  alternative is that it quietly becomes one:

  | Limit                                | Consequence                                                                                                                                                    |
  | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | ~500 recipients/day                  | Fine for verification mail. **Fatal for Phase 6 messaging**, which sends notices to every parent at every school                                               |
  | No SPF/DKIM alignment for our domain | Mail from a personal Gmail lands in spam far more often than a domain-authenticated sender. The banner copy tells people to check spam for exactly this reason |
  | A personal address as the sender     | A school receiving `Confirm your email` from an individual's Gmail reads as phishing, because it looks like phishing                                           |

  The exit is a registered domain and a real provider, and it is blocked on D4. Recorded in docs/13
  so it is on the deployment checklist rather than in somebody's memory.

- `nodemailer` is a new API dependency. It is the mature choice and has no runtime dependencies of
  consequence.
- **Nothing retries.** A failed send is logged and the token stays valid, so the recovery path is a
  person clicking "Send again". A queue with retries is the right answer when there is a queue;
  there is not one yet, and inventing one for a single transactional message would be the harder
  thing to get right.

## Alternatives considered

| Alternative                                 | Why not                                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Resend now, as docs/05 says                 | Needs a verified sending domain. The domain needs D4, which is still open. It would block the feature on a naming decision            |
| Provider SDK + a local mock for development | Two code paths, and the one exercised in development is the one that is never wrong. SMTP is the same wire in both places             |
| No abstraction, call nodemailer directly    | The swap is coming — Gmail cannot survive Phase 6 — and the whole point of doing it now is that callers do not change when it happens |
| Send inside the signup transaction          | Holds a connection open for an SMTP round trip, and a hung relay rolls back a created school                                          |
| Throw on send failure                       | Turns "the mail server blinked" into "your school was not created", after it was                                                      |
| Default `MAIL_DRIVER` to `smtp`             | A half-configured deployment then sends real mail from an unintended identity. Failing closed is the cheaper mistake                  |
