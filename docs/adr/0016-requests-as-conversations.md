# ADR-0016 — Requests are conversations with a status, not an approval engine

**Status:** accepted · 2026-10-17

> A migration header comment elsewhere says "ADR-0016" when it means ADR-0014 (teacher class scope).
> That migration is applied and is not edited; this is the real ADR-0016.

## Context

`docs/modules/workflow-and-comms.md` Part A describes Requests as a **workflow engine**: request
types are data, each with a JSON form schema and an approval chain, and approving one runs a domain
action (`onApprove`). That is the right design for leave, fee waivers and transfer certificates, and
it is a Phase 6 build.

What schools need first is different and much smaller: a parent or a teacher has a **question, a
complaint or a concern**, wants to tell the office, and wants to see what happened to it. Nothing is
"approved" and no domain record changes. It is closer to a help desk than to a workflow.

`/requests` has been a stub ("not built yet") behind a sidebar item every role can see.

## Decision

1. **Build the conversation module now; leave the approval engine for Phase 6.** A request is a
   ticket: a category, a subject, a description, an optional related student, a priority, optional
   image attachments, a status, and an assignee.
2. **Categories are a fixed list in `@ilm/contracts`**, not configuration. They route and filter;
   they carry no form schema and no approvers. When request types become data (Phase 6), these
   become the seeded "general" types and nothing here has to be undone.
3. **Status is a small state machine** — `PENDING → IN_PROGRESS → RESOLVED`, plus `REJECTED` and
   `REOPENED` — defined **once** in `@ilm/contracts` (`REQUEST_TRANSITIONS`). The API enforces it;
   the UI reads the same table to decide which buttons to show (docs/12 R6).
4. **History is a single append-only timeline**, `request_events`: created, message, status change,
   assignment. The application role has `SELECT, INSERT` only, so the audit trail of who said or
   changed what cannot be edited by the application.
5. **Two views of one resource, split by one permission.** `workflow.request.create` (everyone)
   raises requests and reads **only your own**. The new `workflow.request.manage` (Admin,
   Principal, Admin-role, Office Staff) reads **all** requests in the school, replies, assigns and
   changes status. The scope is a query clause in the service, never a post-fetch filter
   (docs/04 §5); a request that is not yours answers 404, the same as one that does not exist.
6. **Reopening belongs to the requester as well.** A requester may move their own resolved or
   rejected request to `REOPENED`; they may not set any other status.
7. **Attachments are images only**, through the existing `StoragePort` (ADR-0013) as a **private**
   asset kind, so they stay in the database and can never be routed to a public CDN. PDFs are not
   accepted: `verifyImage` deliberately refuses anything that is not PNG, JPEG or WebP, and widening
   the shared sniffing rules is a security decision of its own. The portal downsizes phone photos
   in the browser so they fit the 512 KB ceiling.
8. **Notifications get a real backend.** The header bell was hard-coded sample data. A generic
   `notifications` table (per user, `kind`, `entityType`/`entityId`, `readAt`) now backs it. The
   request module writes to it through the exported `NotificationsService`, inside its own
   transaction, so a notification exists if and only if the change it describes does.

## Consequences

- No schema-driven forms, no approval chains, no `onApprove`. A school that wants a leave request
  that pre-fills attendance still waits for Phase 6.
- Notifications fan out to every holder of `workflow.request.manage` when a request is submitted.
  That is a handful of people per school today. If a school ever has hundreds of managers this
  becomes a per-category subscription, which is additive.
- **Erasure** (docs/17 §4): requests, their timeline and attachments are kept for the life of the
  relationship plus one year, redacted (not deleted) when a per-student erasure runs, and deleted with
  the tenant. Notifications are deleted 90 days after they are read. The purge/redaction jobs are
  **not built yet**; the policy rows are in docs/17 and the columns they need already exist.
- Plain-text only. Subjects and messages render as text, never as HTML.

## Alternatives considered

- **Build the full workflow engine now.** Right eventually, wrong first: weeks of schema-form and
  approval-chain work before a parent can say "my child's bus is late".
- **Reuse the `comms` message tables.** Those are outbound bulk messages (WhatsApp/SMS) with a
  one-year retention; a two-way thread with a status is a different shape.
- **PDF attachments now.** Requires changing the shared file sniffing and serving rules; deferred.
