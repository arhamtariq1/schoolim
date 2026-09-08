# 19 — Business Operations & Money Plumbing

How a school's money actually reaches your bank account, and what the product must do to support it.

`modules/super-admin.md` §2.4 already specifies the _software_: subscription lifecycle (trial →
active → past due → suspended → churned), dunning, invoices, manual payment recording. This document
specifies the _business_ around it — the part with no code, that nonetheless blocks the first rupee.

> ⚖️ **Not tax or legal advice.** Rates and thresholds change with every Finance Act and differ by
> province. Every ⚖️ item needs a Pakistani tax practitioner to confirm — one session, before the
> first invoice, not after.

---

## 1. The blocking chain

These are strictly ordered. You cannot legally invoice a school before step 4, and most schools
cannot pay a personal account at all.

```
1. Choose entity          →  2. Register (SECP or FBR)  →  3. NTN
                                                             ↓
6. Invoice a school       ←  5. Business bank account   ←  4. Provincial sales-tax registration ⚖️
```

**Timeline: 2–6 weeks**, mostly waiting. **Start this during Phase 2, not Phase 5.** It is the one
dependency on this roadmap that money cannot accelerate, and discovering it at Phase 5 means a
sellable product sitting idle waiting for a bank account.

---

## 2. Entity — the one decision here

| Option                            | Setup                                                        | Reality                                                                                                                                                                       |
| --------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sole proprietorship**           | NTN + a business bank account. Days, not weeks. Cheapest.    | **Unlimited personal liability.** You hold children's data and school financial records; a single S1 incident reaches your personal assets. Fine to _start_, not to stay.     |
| **SMC-Private Limited** (SECP) ⚖️ | Single-member company. Weeks. Annual filings and an auditor. | **Limited liability** — the reason to bother. Schools also take a registered company more seriously, and some institutional buyers cannot contract with an individual at all. |
| Partnership / Pvt Ltd             | —                                                            | Only if you take a co-founder or investment.                                                                                                                                  |

**Recommendation: sole proprietorship to reach your first two or three paying schools, then SMC-Pvt
Ltd before you scale.** Registering a company before there is revenue buys compliance overhead and
no protection you actually need yet. Registering it _after_ the tenth school means migrating
contracts and a bank account while operating — do it at the Phase 5 boundary.

**The liability clause in your ToS (`17` §3.1) is doing a lot of work while you are a sole
proprietor.** That is the argument for getting it drafted properly rather than copied from a
template.

---

## 3. Tax, in the shape it will actually hit you

Three separate taxes, commonly confused. ⚖️ Confirm all rates and thresholds.

| Tax                                                                           | Who                                         | What it means                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Income tax** (federal, FBR)                                                 | You                                         | On profit. Annual return. Requires an NTN.                                                                                                                                                                                                                                                            |
| **Sales tax on services** (**provincial** — PRA Punjab, SRB Sindh, KPRA, BRA) | You charge the school                       | Software/SaaS services are taxable services. The rate and any reduced IT-services rate differ by province and change ⚖️. **Registration is provincial**, based on where you operate — and if you sell across provinces this gets genuinely complicated. Ask the practitioner about this specifically. |
| **Withholding tax on services** (federal, s.153) ⚖️                           | The **school deducts it from your payment** | The one that surprises people. See below.                                                                                                                                                                                                                                                             |

### Withholding tax has a direct engineering consequence

A registered school paying an invoice for services will commonly **deduct withholding tax at
source** and remit it to FBR on your behalf, giving you a tax certificate. The practical effect:

> You invoice PKR 25,000. The school transfers PKR 22,500. **Neither figure is wrong.**

If your subscription module treats the invoice as unpaid because the amounts differ, you will chase
schools that have in fact paid you in full — the single fastest way to damage a relationship you
spent months building.

**Therefore `platform_invoices` must model, in minor units:**

| Field              | Meaning                                      |
| ------------------ | -------------------------------------------- |
| `grossMinor`       | What you invoiced                            |
| `salesTaxMinor`    | Provincial sales tax charged on top          |
| `withholdingMinor` | Deducted by the school at source             |
| `receivedMinor`    | What actually landed in your account         |
| `writeOffMinor`    | Rounding, bank charges, negotiated shortfall |

**Invariant:** `received + withholding + writeOff = gross + salesTax`. An invoice settles when that
balances — **not** when `received == gross`. A tax certificate is an attachable document on the
invoice, because you need it at your own year end.

This is the same discipline as the fee engine (`12` R3/R4): integer minor units, append-only,
reconciliation by invariant rather than by eyeball. Reuse the pattern; do not invent a second one.

---

## 4. How schools will actually pay you

Design for the market as it is, not as you would like it.

| Method                   | Likelihood                                           | Handling                                                                                          |
| ------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Bank transfer / IBFT** | **Dominant.** Expect this to be ~all of it at first. | Manual recording in super-admin. Match by reference; expect the reference to be wrong or missing. |
| **Cheque**               | Common with older institutions                       | Record on deposit, not on receipt. Add a clearing status.                                         |
| **Cash**                 | Small schools, uncomfortably often                   | Receipt required. Keep this out of the product's happy path.                                      |
| Card / recurring         | Rare for B2B here                                    | Not worth building in v1.                                                                         |

**Consequences, all cheap now and expensive later:**

1. **Manual payment recording is the primary flow, not the fallback.** `super-admin.md:60` already
   says this — it is correct, and it should stay correct through Phase 8.
2. **Nothing auto-suspends.** Dunning escalates to a _reminder_, then to a **read-only mode you
   trigger by hand** (`super-admin.md:63`). An automated suspension will eventually fire on a school
   that paid last Thursday and whose transfer you have not yet recorded.
3. **Annual billing, invoiced before the session starts.** Schools budget by academic session and
   their cash arrives with fee collection. Aligning with that rhythm collects far more reliably than
   monthly billing — it is also why D2's recommendation is flat annual tiers.
4. **Every invoice needs a PDF that looks like a real invoice** — NTN, sales-tax registration
   number, invoice number from a **gapless sequence**, line items. A school's accountant cannot pay
   against a Stripe-style email receipt. Reuse `@react-pdf/renderer` and `number_sequences`; both
   already exist for vouchers.

---

## 5. Unit economics — know these before pricing

Pricing is deferred (D2), but the **cost floor** is not a decision, and you cannot price without it.

| Cost                                           | Nature                                                 | Note                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Hosting (Vercel Pro, Postgres, Redis, storage) | Fixed, ~$25–60/mo                                      | Amortises across all schools. Effectively free per school.                                              |
| **WhatsApp / SMS**                             | **Per message — the only cost that scales with usage** | 500 students × several notices/month, per school. **This is the entire variable cost of the business.** |
| Sentry, uptime, email                          | Fixed, small                                           |                                                                                                         |
| **Your support time**                          | **The real cost**                                      | R9 in `15`. A school that needs 3 hours/month is unprofitable at almost any subscription price.         |

**Two rules that follow directly:**

- **Message quotas per plan, from the day messaging ships (Phase 6).** `message_log.cost_minor`
  already exists; the quota and the soft/hard cap must ship _with_ the feature, never retrofitted.
  R11 is the risk of getting this wrong.
- **Track support minutes per school from the first customer.** Not to bill for them — to identify
  the school that is quietly costing you more than it pays, while there is still time to fix the
  product instead of absorbing the cost.

---

## 6. Contract-to-cash, end to end

The flow the product must support. Steps marked ▸ are super-admin features already in
`modules/super-admin.md`; the rest are business process.

**There are two paths in, and the self-serve one is now the default** (ADR-0010).

```
SELF-SERVE (default)
Landing page  →  Signup form  →  ToS + DPA accepted (versioned, recorded)
                                          ↓
                              School created, 30-day trial starts, owner signed in
                                          ↓
SALES-LED (group deals, negotiated pricing)
Demo  →  Quote  →  ToS + DPA accepted (versioned) ▸  →  School created, trial starts ▸
                                                                    ↓
Renewal ▸  ←  Payment recorded ▸  ←  Invoice issued (PDF) ▸  ←  Trial converts ▸
    ↓                                      ↓
 (or churn: 30-day export window,     (or no payment: reminder → reminder →
  then hard delete, `17` §4)           manual read-only. Never delete data.)
```

Both paths converge at "trial starts". Everything downstream — conversion, invoicing, dunning, churn
— is identical and remains Phase 5.

**The acceptance record now exists, and shipped early because of the split above.** `17` §3
specifies `school_agreements(school_id, document_type, version, accepted_at, accepted_by, ip)`. It
was scheduled with the subscription module in Phase 5; self-serve moved it forward, because
self-serve is exactly what removes the operator who could otherwise attest to what was agreed. If
the tick box is not recorded at the moment it is ticked, reconstructing who accepted which version
afterwards is impossible.

**What self-serve does not yet have, and must before it is advertised widely:**

| Gap                           | Consequence today                                                     | Lands       |
| ----------------------------- | --------------------------------------------------------------------- | ----------- |
| Trial expiry is not enforced  | `trial_ends_at` is set and nothing reads it. A trial simply runs on   | **P5**      |
| ~~No email verification~~     | ~~A typo in the owner's address means an account nobody can recover~~ | ✅ ADR-0012 |
| Pricing is **D2**, still open | The packages on the landing page are placeholders                     | **P5**      |
| **Mail deliverability**       | Confirmations go out from a consumer Gmail and often land in spam     | **D4**      |

Email verification landed early (ADR-0012) because that gap was not billing-shaped: it is "this
tenant may already be unrecoverable", and it accrues from the first real signup rather than from the
first invoice. It sends a link and records the confirmation; it does **not** yet gate anything, and
the gate belongs with trial conversion in P5.

The gap it introduced is the last row. Mail leaves through a consumer Gmail account (ADR-0011):
roughly 500 recipients a day, and no SPF/DKIM alignment for a domain we own, so a fair share of
confirmations are filtered. Survivable for a handful of transactional messages, **fatal for Phase 6
messaging**, and the fix — a registered domain and a real provider — is blocked on D4.

---

## 7. What this adds to the build

| Where              | Item                                                                                      | Phase                    |
| ------------------ | ----------------------------------------------------------------------------------------- | ------------------------ |
| Business ⚖️        | Entity chosen, NTN, provincial sales-tax registration, business bank account              | **Start in P2**          |
| Business ⚖️        | One session with a tax practitioner: sales tax by province, withholding, invoicing format | Before the first invoice |
| `07` / super-admin | `platform_invoices` with the five money fields and the settlement invariant (§3)          | P5                       |
| `07` / super-admin | `school_agreements` versioned acceptance (`17` §3)                                        | P5                       |
| Super-admin        | Invoice PDF with NTN + sales-tax number + gapless invoice sequence                        | P5                       |
| Super-admin        | Withholding-tax certificate as an attachable document                                     | P5                       |
| Super-admin        | Support-minutes-per-school tracking                                                       | P5                       |
| Comms              | Per-plan message quotas with soft and hard caps, shipped **with** messaging               | P6                       |
| Pricing            | **D2 — deferred by decision.** Needed before P5 exit.                                     | P5                       |

**Sources:** `modules/super-admin.md` §2.4 (subscription lifecycle) · `17-legal-and-compliance.md`
§3 (ToS/DPA) · `15-risks-and-open-decisions.md` R9, R11 · ⚖️ FBR and provincial revenue-authority
rates to be confirmed with a practitioner at the time of registration.
