# Module — Workflow & Communication (Phase 6)

---

## Part A — Requests & Approvals

### 1. Why this is a module and not a feature

The old portal had a "Requests" menu item. Every school will want a different set of requests, with
different fields and different approvers. If each one is coded, you get the same explosion that made
the last portal unmaintainable. So: **request types are data.**

```
request_types.form_schema     zod-compatible JSON describing the fields to render
request_types.approval_chain  [{ step: 1, role: 'PRINCIPAL' },
                               { step: 2, role: 'ACCOUNTANT', condition: 'amount > 50000' }]
```

The API validates a submission against `form_schema`; the UI renders the form from the same schema.
Adding "Bus Route Change Request" is a Settings screen, not a deploy.

### 2. Built-in types (seeded for every new school, editable)

| Type | Raised by | Approvers | Effect on approval |
|---|---|---|---|
| Student leave | Parent / Student | Class teacher → Coordinator | Pre-fills attendance |
| Staff leave | Staff | Head of dept → Principal | Blocks timetable, marks attendance |
| Fee discount | Admin / Reception | Principal → Owner | Creates `student_discounts` |
| Fee waiver | Accountant | Principal | Creates a waiver line on the voucher |
| Fee refund | Accountant | Principal → Owner | Creates an outgoing transaction |
| Transfer certificate | Parent / Admin | Accountant (clearance) → Principal | Generates the TC PDF, marks student `LEFT` |
| Section change | Admin | Coordinator | Ends and recreates the enrollment |
| Data correction | Any staff | Admin | Applies a field change with before/after in the audit log |
| Expense approval | Accountant | Principal (over threshold) | Marks the expense `APPROVED` |

**Design rule:** approval must *do* something. A request that is approved and then requires someone
to go and manually make the change is worse than no workflow at all. Each type declares an
`onApprove` handler that performs the domain action inside the same transaction as the approval.

### 3. Screens

- **My Requests** — what I raised, and its stage.
- **Approvals inbox** — everything waiting on me, on every role workspace home screen, with
  approve/reject **inline** and a required note on reject. Bulk approve where safe.
- **Request detail** — the form data, the full action trail, attachments, discussion thread.
- SLA/ageing: requests older than N days are highlighted and escalate to the next approver.

### 4. Transfer certificate / clearance (worth calling out)

A leaving student triggers a checklist: fees cleared? library returned? deposit settled? Each item is
signed off by the responsible role, then the TC PDF generates with a serial number, and the student
moves to `LEFT`. Schools do this on paper today and lose money on it every year.

---

## Part B — Communication

### 1. Channel strategy for this market

| Channel | Use | Notes |
|---|---|---|
| **WhatsApp** | Primary. Vouchers, absence alerts, reminders, notices | Highest read rate in Pakistan by a wide margin. Use the official Cloud API — template messages must be pre-approved by Meta; build the template registry accordingly. |
| **SMS** | Fallback, OTPs, short alerts | Local aggregator (Telenor/Jazz corporate SMS). Costs per message — meter it. |
| **Email** | Formal notices, reports, staff, statements | Resend/SES. Cheap, low engagement with parents here. |
| **In-app** | Everything, always | Free, permanent, and the audit trail. |
| **Push (PWA)** | v2, once the parent app exists | |

**Architecture:** one `NotificationService` with a `ChannelAdapter` port per channel. Domain code
calls `notify(event, recipients, data)` and never names a channel. Per-school, per-event channel
preferences live in settings. Swapping a WhatsApp provider must touch exactly one file.

### 2. Templates

- `message_templates` per school, per channel, with variables (`{{student_name}}`,
  `{{amount}}`, `{{due_date}}`, `{{voucher_url}}`).
- Live preview with sample data; variable validation on save.
- Seeded defaults in English and Urdu so a new school can send on day one.
- Every send snapshots the rendered body into `message_log` — so "what exactly did you send my
  parent" is always answerable.

### 3. Automated notifications (opt-in per school)

| Event | To | Default |
|---|---|---|
| Voucher issued | Fee payer | On |
| Payment received | Fee payer | On (this one prevents the most disputes) |
| Due date approaching (T-3) | Fee payer | On |
| Overdue (T+1, T+7, T+15) | Fee payer | Escalating ladder |
| Marked absent | Guardian | On |
| Chronic absence threshold | Guardian + Coordinator | On |
| Leave approved/rejected | Applicant | On |
| Results published | Parent + Student | On |
| Fee increment for next session | All fee payers | Off by default |
| Holiday / event notice | Selected audience | Manual |

### 4. Bulk messaging

**Screen:** Communication › Send

Audience builder → template → preview → **cost and count estimate** → schedule or send now →
live delivery report.

Audience = any saved view: "all Grade 5 parents", "defaulters over 30 days", "teaching staff",
"students with attendance below 75%". Reusing saved views here is why the reporting engine is built
in Phase 1.

Guardrails: per-day send caps, a confirmation showing the exact recipient count, a hard stop on
sending the same template to the same recipient twice within a window, and opt-out handling.

### 5. Cost metering

WhatsApp and SMS cost money per message. `message_log.cost_minor` accumulates per school, is exposed
in the super-admin usage view, and can be capped by plan. A school on the Starter plan gets N
messages/month, then a soft warning and a hard stop. Design this in Phase 6, do not retrofit it —
messaging is the one line item that can make a customer unprofitable.

---

## Part C — Parent & Student Portal

Not a separate app in v1 — the same `apps/web` with the parent/student role workspaces and a
mobile-first layout. A PWA manifest in Phase 6 gives an installable app icon without app-store work.

**Parent home:**
- Child switcher when there are several
- Current voucher card: amount, due date, Download PDF, Pay (when a gateway is live)
- Payment history with downloadable receipts
- Attendance calendar for the month + term percentage
- Results when published
- Notices, and a message thread with the class teacher (v2)

**Design constraints:** low-end Android, slow connections, mixed literacy. Large targets, minimal
text, Urdu toggle, initial route under 100 KB JS, works on a 3G connection.

---

## Definition of done for Phase 6

- [ ] A school can define a new request type and approval chain from Settings with no deploy
- [ ] Approval performs the domain action transactionally; a failed action rolls back the approval
- [ ] WhatsApp template registry, send, and delivery-status webhook all working
- [ ] Bulk send to 500 recipients with per-recipient status and cost recorded
- [ ] Parent portal loads and is usable on a low-end Android device over 3G
- [ ] Every automated notification is individually toggleable per school
