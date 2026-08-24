# 17 — Legal, Privacy & Data Governance

You will hold the personal data of **children**, their guardians' phone numbers and addresses, staff
salary figures and a school's complete financial position. That is the most sensitive category of
data a small SaaS can carry.

> **This document is not legal advice.** It is an engineering and commercial specification written so
> that a lawyer's review costs one hour instead of ten, and so that the product is defensible before
> anyone asks. Every item marked ⚖️ needs a Pakistani lawyer or tax practitioner to confirm before
> the first paying school signs.

---

## 1. The legal position, honestly

| Instrument | Status | What it means for you |
|---|---|---|
| **Personal Data Protection Bill (PDPB)** | Drafted by MoITT and revised repeatedly since 2020. **Not reliably enacted.** ⚖️ Verify status before launch. | There is no comprehensive Pakistani data-protection statute to comply with *today*. Build to the draft anyway — see §2. |
| **PECA 2016** (+ 2025 amendment) | **In force.** | Criminalises unauthorised access to and copying of data from an information system. It governs an *attacker*, and it governs **you** if you access a school's data without authorisation. This is the statute behind §5. |
| **No breach-notification duty** | Correct as of writing ⚖️ | Nobody legally compels you to disclose a breach. **Disclose anyway** — see §6. The contractual duty you write into your own DPA is the one that binds you. |
| **GDPR** | Applies only if you process data of people in the EU/UK | Almost certainly irrelevant for Pakistani schools. Revisit only if you sell abroad. |
| **Data residency** | No general requirement for private schools ⚖️ | Relevant only if you ever sell to government schools or a buyer makes it a contract term. Note the implication: Supabase and Railway are **not** in Pakistan. |

**The conclusion that matters:** the statutory floor is low, so *the law is not what protects you*.
Your contract, your privacy policy, and your engineering controls are. Schools will ask "who owns
this data" in the first meeting — usually the principal, not a lawyer, and a clear answer wins trust
that competitors do not bother to earn.

---

## 2. Build to the draft PDPB, not to the current vacuum

Retrofitting privacy is the second-most expensive retrofit after multi-tenancy. The draft PDPB
follows the familiar GDPR-shaped principles; building to them now costs almost nothing and makes you
compliant by default whenever the law lands.

| Principle | How the architecture already satisfies it | Gap to close |
|---|---|---|
| **Purpose limitation** | Data is used to operate the school portal, nothing else | Write it down in the privacy policy (§3) |
| **Data minimisation** | Only fields a school actually configures are collected; custom fields are opt-in | Do **not** make CNIC/B-Form mandatory at the product level — make it a per-school setting |
| **Accuracy** | Schools edit their own records; every change is audited | — |
| **Storage limitation** | — | **Missing.** Define retention. See §4. |
| **Integrity & confidentiality** | Three isolation layers (`04` §2), pgcrypto on CNIC/B-Form, TLS, argon2id | — |
| **Accountability** | `audit_logs` on every mutation | Surface it to the school, not just to you (§5) |
| **Data subject rights** — access, correction, erasure, portability | Self-serve per-school ZIP export (`13` §6) | **Add a per-student export**, and an erasure runbook (§4) |
| **Lawful basis** | The school is the controller; you are the processor | This distinction is the whole of §3. Get it right. |

---

## 3. The three documents you must publish

**You are the processor. The school is the controller.** The school decides what data to collect
about its students and why; you only process it on their instruction. This is not a technicality — it
is what lets you answer "do you own our data?" with a flat **no**, and it puts the duty to obtain
parental consent where it belongs, on the school.

### 3.1 Terms of Service (school ↔ you)
The commercial contract. Must state:
- Subscription term, price, billing cycle, what happens on non-payment
  (→ read-only, **never data deletion** — see `modules/super-admin.md:63`)
- Uptime commitment. **Do not promise an SLA with penalties in v1.** Say "we target 99.5% and will
  tell you when we miss it." A penalty clause you cannot honour as a solo operator is worse than none.
- Limitation of liability ⚖️ — the single most important clause for you personally
- Termination: notice period, and the guarantee that data is exportable for **30 days** afterward
- Governing law and jurisdiction ⚖️

### 3.2 Privacy Policy (public, for parents and staff)
Written for a parent to read, in plain language, in **Urdu and English**. Must state: what is
collected, why, who can see it, where it is stored (**name the country** — Supabase/Railway are
overseas), how long it is kept, how to request correction or deletion, and who to contact.

### 3.3 Data Processing Agreement (annexed to the ToS)
This is the document that wins enterprise-ish deals. Must commit to:
- Processing only on the school's documented instruction
- The **operator access policy in §5** — verbatim, because that is the clause that builds trust
- Sub-processors, **named**: Supabase (later Railway), Vercel, Cloudflare R2, Resend, Sentry,
  the WhatsApp/SMS provider. Commit to notifying schools before adding one.
- Breach notification to the school within **72 hours** of your becoming aware (§6)
- Deletion or return of all data within 30 days of termination
- The school's right to audit — in practice, their right to read their own `audit_logs`

**Product implication:** the ToS, Privacy Policy and DPA are **versioned records in the database**,
not PDFs in a drive. `school_agreements(school_id, document_type, version, accepted_at, accepted_by,
ip)` — because in a dispute two years from now you must prove *which version* they accepted.

---

## 4. Retention & erasure — the missing policy

Schools keep student records for decades; that is a genuine academic-records requirement, not
hoarding. But "keep everything forever" is indefensible and makes every future breach worse.

| Data | Retention | Why |
|---|---|---|
| Student academic record (enrolment, results, attendance summaries) | **Life of the school relationship + 10 years** | Alumni request transcripts years later. This is the school's legal record. |
| Financial records (vouchers, payments, ledger) | **10 years** minimum ⚖️ | Tax and audit. Also append-only, so never deleted anyway (`12` R4). |
| Raw attendance rows | **3 years**, then roll into monthly summaries | The summary answers every real question; the raw rows are 10M+ and grow forever (`15` R12) |
| `audit_logs` | **3 years hot, then archive to cold storage** | Growth is unbounded. Partition monthly, same as attendance. |
| Guardian contact details | Life of relationship + 1 year | No reason to keep a phone number after the last child leaves |
| Uploaded documents (B-Form scans, photos) | Life of relationship + 1 year | The highest-risk blob you hold. Aggressive deletion here is the best breach mitigation available. |
| Message logs (WhatsApp/SMS content) | **1 year** | Delivery disputes are resolved within weeks; content retention is pure liability |
| Server/access logs | 90 days | Enough for a forensic investigation |
| A churned school's entire tenant | **30-day grace, then hard delete** by audited runbook (`04` §7) | Already specified. Now it has a deadline attached. |

**Two erasure paths, both needed:**
1. **Per-student erasure** — a parent asks for their child's data to be removed after leaving.
   Anonymise rather than delete: replace name/contact/documents with a tombstone, **retain the
   financial and academic rows** (they are the school's record and are append-only). One runbook,
   audited, executed by the school's own admin — not by you.
2. **Per-school deletion** — full tenant offboarding. Already specified in `04` §7.

> **Engineering consequence:** every table needs to answer "how does a row here get erased or
> anonymised?" Add that column to the table review in `12`. A table with no answer does not ship.

---

## 5. Operator access — the insider-threat policy

You will have the technical ability to read every child's record in every school. Impersonation is
already designed and audited (`04` §6). What was missing is the **policy**, and the policy is the
part a buyer actually asks about.

**Publish this in the DPA. It is a sales asset, not a disclosure.**

### The five commitments

1. **Access is exceptional, never routine.** Platform staff access a school's tenant data only to
   (a) resolve a support request that school raised, (b) investigate a specific incident, or
   (c) execute a migration the school has been notified of. Curiosity is not a reason.
2. **Access is never silent.** The school portal shows a persistent, unmissable banner during any
   support session (`04` §6). The school can see every past session in their own audit log —
   **not just you**. If a school cannot see that you were in their data, the commitment is theatre.
3. **Access is read-only by default.** Writing while impersonating requires an explicit typed reason
   and a second confirmation, both retained in the audit record (`04` §6).
4. **Access is time-boxed.** 30-minute token, no silent renewal. Re-entry is a new audited session.
5. **Access is reviewed.** Monthly, you read your own impersonation log. Quarterly, the count and the
   reasons go into a summary a school can request.

### Who audits the auditor

The honest answer for a solo founder is: *nobody, structurally* — and pretending otherwise is worse
than admitting it. What makes the commitment real anyway:

- **The log is append-only and lives in the school's own tenant.** You cannot quietly delete an
  impersonation record without the deletion itself being visible.
- **The school is notified**, so detection does not depend on your honesty.
- **Platform credentials are separate** (`platform_users`, separate cookie, separate login) with
  **mandatory 2FA** — so a compromised platform account requires a second factor, and a compromised
  *tenant* account can never escalate to platform.
- When you hire the first support person, they get a **platform role with impersonation but not
  data-export or delete**, and you review their log weekly. Design the role now; the table already
  supports it.

### The three things platform staff must never be able to do

| Never | Enforced by |
|---|---|
| Read tenant data without an audit record existing first | Audit write is inside the same transaction as the token issue — no record, no token |
| Export a school's full dataset without the school's request on file | Export requires a typed reason and is rate-limited to one per school per day; alerts fire on it |
| Silently modify financial records | Financial tables are append-only (`12` R4). Even a superuser correction is a reversing entry with an actor. |

---

## 6. Breach response — the commitment

No law compels disclosure ⚖️. **Commit contractually to 72 hours anyway**, because the alternative
is a school discovering it another way, and that ends the company faster than the breach does.

The technical and human runbook lives in `18-incident-response-and-operations.md` §4. What belongs
here is the promise:

- Notify **every affected school** within 72 hours of becoming aware — even when the scope is still
  unknown. "We know X, we do not yet know Y, here is what we are doing" is an acceptable first notice.
- Tell them **what data**, **how many records**, **what you have done**, and **what they should do**.
- Follow with a written post-incident report within 14 days.
- Never quietly fix a cross-tenant leak. **R1 in `15` is fatal precisely because concealment is what
  makes it fatal.**

---

## 7. What this adds to the build

| Where | Item | Phase |
|---|---|---|
| `07` data model | `school_agreements` (versioned acceptance record) | P5 |
| `07` data model | `retention_policies` per school, defaults from §4 | P9 |
| `04` §6 | 2FA mandatory on `platform_users` | P5 |
| `04` §6 | Impersonation sessions visible in the **school's own** audit view | P5 |
| Product | Per-student anonymisation runbook + admin action | P9 |
| Product | CNIC/B-Form collection is a per-school setting, not a required field | P1 |
| Product | `audit_logs` and raw attendance partitioned monthly with an archive job | P0 (attendance), P9 (audit archive) |
| Legal ⚖️ | ToS, Privacy Policy (Urdu + English), DPA drafted and reviewed | **Before the first paying school** |
| Legal ⚖️ | Confirm PDPB status; confirm financial-record retention period | Before P5 exit |

**Sources:** [MoITT Personal Data Protection Bill drafts](https://moitt.gov.pk/) · [PECA 2016 text](https://na.gov.pk/uploads/documents/1470910659_707.pdf) · [PECA (Amendment) Act 2025](https://na.gov.pk/) — ⚖️ all statuses to be confirmed with counsel at the time of launch.
