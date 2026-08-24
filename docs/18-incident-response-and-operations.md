# 18 — Incident Response & Operations

`13` §5–6 defines the *signals* (Sentry, uptime, `job_runs`) and the *targets*
(**RTO 4h / RPO 1h**). This document defines the **human process** — what you actually do at 07:55
on the 5th of the month when the API is down and eleven schools are trying to collect fees.

> The whole point of writing this now is that you will not think clearly during an incident.
> A runbook written calmly at midnight in month two is worth more than any amount of improvisation
> in month nine.

---

## 1. Severity levels — decide this once, not during the fire

The only question that matters in the first 60 seconds is *"how bad is this?"*, because the answer
determines whether you wake up, whether you tell customers, and whether you can finish your dinner.

| Sev | Definition | Example | Response | Customer comms |
|:--:|---|---|---|---|
| **S1** | **Data integrity or isolation compromised.** Money is wrong, or a tenant boundary broke. | Cross-tenant leak · double-billed vouchers · payments allocated to the wrong student · data loss | **Immediately, any hour.** Stop the bleeding first: read-only mode. | Within **2 hours**, proactively, to affected schools. A breach follows `17` §6 — 72 hours, always. |
| **S2** | **Product fully unavailable**, or a core money flow is broken for everyone. | API down · login broken · voucher generation failing for all schools · payments not recording | **Immediately during 07:00–18:00 PKT.** After hours: immediately if a school is mid-collection. | Status page within **30 minutes**. Direct message to school admins if >1 hour. |
| **S3** | **One school, or one non-critical module, is broken.** | One school's import fails · attendance report times out · PDF renders wrong for one template | Same business day. | Reply to the reporting school. No broadcast. |
| **S4** | Cosmetic, or a workaround exists. | Misaligned column · confusing label · slow-but-working page | Next planned work. | None. |

**Two calibration rules, because a solo operator will otherwise over- or under-react:**
- **Anything touching money or tenancy starts at S1 until proven otherwise.** Downgrade later. The
  cost of over-reacting is a lost evening; the cost of under-reacting is the company.
- **School hours are 07:00–14:00 PKT; fee collection peaks on the 1st–10th of the month.** An
  incident at 08:00 on the 5th is categorically worse than the same incident at 20:00 on the 22nd.
  The severity table sets the floor; the calendar can raise it.

---

## 2. The first ten minutes

In order. Do not skip step 1 to investigate — investigation without a timestamped record is how you
end up unable to explain what happened.

```
1. OPEN THE LOG      Start docs/incidents/YYYY-MM-DD-slug.md. Timestamp every line from here.
2. DECLARE SEVERITY  From §1. Write it down. It can change; the change gets a timestamp too.
3. STOP THE BLEEDING Read-only mode > partial data corruption. Availability is recoverable;
                     wrong money in a parent's hand is not.
4. TELL SOMEONE      S1/S2 → status page NOW, before you know the cause.
                     "We are investigating" posted at 07:58 beats a perfect explanation at 09:30.
5. THEN diagnose.
```

**Step 3 needs a feature that must exist before it is needed.** The read-only mode flag from
`modules/super-admin.md` (built for subscription dunning) is the same switch — **make it operable
per-school and platform-wide, and test it in Phase 5.** A kill-switch you have never pulled is not a
kill-switch.

---

## 3. The runbooks

Each lives in `docs/runbooks/` as a numbered file. **A runbook that has never been executed is
fiction** — every one carries a "last rehearsed" date, and a stale date is a finding at the phase
review.

| # | Runbook | Trigger | Rehearse |
|---|---|---|---|
| **RB-01** | **Database restore from backup** | Data loss, corruption, bad migration | **Quarterly, timed** (already mandated in `13` §6) |
| **RB-02** | **Enable/disable read-only mode** | Any S1/S2 | Every phase boundary |
| **RB-03** | **Roll back a deploy** | Bad release | Every phase boundary — it is one command; prove it |
| **RB-04** | **Voucher generation failed or partially completed** | The one alert that always wakes you (`13` §5) | Once, on the demo tenant, in P2 |
| **RB-05** | **Suspected cross-tenant leak** | Any hint of R1 | Tabletop once, in P5 |
| **RB-06** | **Credential rotation** | Suspected compromise, staff departure, phase boundary | At every phase boundary |
| **RB-07** | **Supabase → Railway migration** | Phase 5 | Dry-run in **Phase 1** (`00` §8) |
| **RB-08** | **Tenant offboarding / hard delete** | A school churns, 30-day grace elapsed | Once, on the demo tenant |
| **RB-09** | **Restore a single school from backup** | One school's data damaged, others fine | Once — this is *harder* than a full restore and you will need it more often |

**RB-04 deserves its own note**, because it is the incident you will actually have. A partial run
means some parents have vouchers and some do not, and the accountant cannot tell which. The recovery
is already designed — `job_runs` with a cursor, resumability, `ON CONFLICT DO NOTHING` against the
unique constraint — so the runbook is mostly *communication*: resume the run, verify counts against
the preview, then tell the accountant exactly what happened before they discover it themselves.

---

## 4. Security incident — the extra steps

A security incident is an S1 that additionally requires evidence preservation. **Before** you fix
anything:

1. **Snapshot, do not clean.** Database snapshot, log export, Sentry events. Fixing destroys the
   evidence that tells you the scope.
2. **Scope it.** Which schools, which tables, how many rows, what time window. `audit_logs` is the
   record that answers this — which is why it is append-only.
3. **Contain.** Rotate credentials (RB-06), revoke sessions, read-only mode if the vector is unclear.
4. **Notify.** `17` §6 — 72 hours, contractually. First notice may be incomplete.
5. **Fix, then verify the fix** with a test that fails against the old code. For a tenancy bug, that
   test joins the isolation suite permanently.
6. **Post-incident report** to affected schools within 14 days.

**The specific case that matters most:** a suspected cross-tenant leak (R1). Treat it as confirmed
until proven otherwise. Run the isolation suite immediately; if it passes, the bug is in a raw query
or a route that bypasses `TenantPrisma` — grep for `$queryRaw` and for any service taking a
`schoolId` parameter (which `12` R2 forbids precisely so this grep works).

---

## 5. Post-incident review

**Every S1 and S2 gets a written review within 7 days. No exceptions, including the ones that were
your own fault** — especially those, since as a solo developer they all are, and a culture of
skipping them is a culture of repeating them.

```markdown
# Incident YYYY-MM-DD — <one line>
**Severity** · **Duration** · **Schools affected** · **Data affected**
## Timeline        (from the incident log — first detection to resolution)
## Root cause      (technical, not "human error" — what let the human make it?)
## Why not caught  (the honest one: which test, alert or review should have found this?)
## Actions         (each with an owner and a date; at least one must be a test or an alert)
```

**The rule that makes this worth doing:** every S1/S2 review must produce **at least one automated
check** — a test, an alert, a CI gate, or a database constraint. A review whose only output is "be
more careful" has failed. This is how `15`'s risk register stays honest instead of decorative.

---

## 6. Status page & customer communication

**Build this before the first paying school.** It is a static page on a **different host** from the
API — a status page that goes down with the product is worse than none.

| Property | Choice |
|---|---|
| Where | `status.<domain>` — static, Cloudflare Pages or Vercel, **not** the API host |
| Who updates it | You, manually. Automated status pages lie during partial outages. |
| Language | Urdu and English |
| Content | What is broken · what still works · what to do meanwhile · next update time |

**Two rules learned the expensive way:**
- **Always commit to a next-update time**, and post at that time even with nothing new. Silence is
  what makes customers phone you, which is what stops you fixing the incident.
- **Never say "resolved" before you have verified it with a real transaction** on a real school's
  data. A second outage announcement destroys more trust than the first one did.

**Channel reality for this market:** school admins live on WhatsApp, not email and not a status page.
The status page is the record; **a WhatsApp broadcast to school admins is the actual notification.**
Build that list from day one — it costs nothing and it is the difference between "they told us" and
"we found out."

---

## 7. Operational calendar

Ops work that is not scheduled does not happen. These belong in a calendar, not in this document.

| Cadence | Task |
|---|---|
| **Daily** (5 min) | Sentry new-issue triage · failed `job_runs` · overnight queue depth |
| **Weekly** | Dependency alerts · backup completion check · schools with zero logins (churn signal, `13` §5) |
| **Monthly** | **Read your own impersonation log** (`17` §5) · review S3/S4 backlog · cost review |
| **Quarterly** | **Timed restore drill (RB-01)** · credential rotation (RB-06) · dependency audit · review this document |
| **Per phase boundary** | Rehearse RB-02, RB-03, RB-06 · security gate from `04` §8 |

---

## 8. The solo-operator reality (R13)

`15` lists bus factor as a high-likelihood, high-impact risk. Incident response is where it bites
hardest: there is no second pager. What actually mitigates it:

- **Every runbook is written for someone who is not you** — no undocumented steps, no "obviously
  then you…". The test is whether a competent developer with repo access could execute it cold.
- **A sealed credentials envelope** — password-manager emergency access granted to one trusted
  person. Not so they can operate the product, but so the schools' data is not lost with you.
- **Automate the alert, not the response.** You cannot be on call 24/7 and should not pretend to be.
  The ToS says "we target 99.5%" (`17` §3.1) precisely so that a 3am outage is a disappointment
  rather than a breach of contract.
- **Set expectations in the sales conversation.** "One person, responds within X hours during school
  hours" is a fact schools can accept. Discovering it during an outage is not.

**Sources:** `13-infrastructure-and-deployment.md` §5–6 (signals and RTO/RPO) · `17-legal-and-compliance.md` §6 (breach notification) · `15-risks-and-open-decisions.md` R1, R7, R13, R15.
