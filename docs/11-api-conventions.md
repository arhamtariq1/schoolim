# 11 — API Conventions

One contract, defined once in `@ilm/contracts`, consumed by the API and both apps.

---

## 1. Versioning & URLs

```
https://api.ilm.pk/api/v1/{module}/{resource}
```

- Version in the path. `v1` stays until a breaking change is genuinely unavoidable.
- Resources are plural nouns, `kebab-case`: `/fees/fee-plans`, `/fees/generation-runs`.
- Non-CRUD operations are sub-resources or explicit action endpoints:
  `POST /fees/vouchers/:id/cancel`, `POST /fees/generation-runs/:id/reverse`. Verbs are allowed when
  the operation is genuinely not CRUD — do not contort a state change into a `PATCH` that hides what
  happened.
- Platform routes are namespaced: `/api/v1/platform/*`.

## 2. The contract package

```ts
// packages/contracts/src/fees/voucher.ts
import { z } from 'zod';

export const voucherStatus = z.enum([
  'DRAFT',
  'ISSUED',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'CANCELLED',
  'WAIVED',
]);

export const voucherDto = z.object({
  id: z.uuid(),
  voucherNo: z.string(),
  student: z.object({ id: z.uuid(), name: z.string(), admissionNo: z.string() }),
  billingPeriod: z.object({ id: z.uuid(), code: z.string(), label: z.string() }),
  issueDate: z.iso.date(),
  dueDate: z.iso.date(),
  grossMinor: z.int(),
  discountMinor: z.int(),
  arrearsMinor: z.int(),
  netPayableMinor: z.int(),
  paidMinor: z.int(),
  balanceMinor: z.int(),
  status: voucherStatus,
  lines: z.array(voucherLineDto),
});
export type VoucherDto = z.infer<typeof voucherDto>;

export const voucherListQuery = paginated.extend({
  billingPeriodId: z.uuid().optional(),
  sectionId: z.uuid().optional(),
  status: voucherStatus.array().optional(),
  q: z.string().trim().min(1).optional(),
  sort: z.enum(['issueDate', 'dueDate', 'balance', 'student']).default('dueDate'),
  order: z.enum(['asc', 'desc']).default('asc'),
});
```

The API validates with `nestjs-zod` against these schemas; the frontend parses responses with the
same schemas in development (skipped in production for performance). A contract drift becomes a
loud, immediate failure rather than a rendering bug two screens later.

**All money crosses the wire as integer minor units with a `Minor` suffix.** No floats, ever. The UI
formats; the API never sends a pre-formatted string.

---

## 3. Response envelope

Every successful response:

```jsonc
// single
{ "data": { … }, "meta": { "requestId": "…" } }

// list
{
  "data": [ … ],
  "meta": {
    "requestId": "…",
    "page": { "total": 512, "limit": 50, "offset": 0, "nextCursor": "eyJ…" },
    "aggregates": { "totalOutstandingMinor": 21000000 }
  }
}
```

`meta.aggregates` is why lists carry an envelope: the total outstanding across the _filtered_ set is
needed on the same screen as the rows, and a second round-trip for it is both slower and racy.

---

## 4. Errors — RFC 9457 `application/problem+json`

```json
{
  "type": "https://ilm.pk/errors/voucher-already-paid",
  "title": "Voucher already paid",
  "status": 409,
  "code": "FEES_VOUCHER_ALREADY_PAID",
  "detail": "Voucher V-2026-09-0412 was fully paid on 2026-09-08 and cannot be cancelled.",
  "instance": "/api/v1/fees/vouchers/8f2…/cancel",
  "requestId": "01J8…",
  "errors": [
    { "field": "amountMinor", "code": "TOO_LARGE", "message": "Exceeds the outstanding balance." }
  ]
}
```

- `code` is a stable machine constant declared in `@ilm/contracts/errors.ts`. The frontend switches
  on `code`, never on `title` or `detail`.
- `detail` is written for the person reading it — a school accountant, not a developer.
- Status usage: `400` validation · `401` unauthenticated · `403` permission denied · `404` not found
  **or hidden by tenant/scope** · `409` state conflict · `422` business rule violation · `429` rate
  limited · `500` unexpected.

**Cross-tenant access returns `404`, never `403`.** A `403` confirms the record exists.

---

## 5. Pagination

- **Offset** where users need page numbers (most admin lists): `?limit=50&offset=100`.
- **Cursor** for large or streaming sets (attendance history, audit log, exports):
  `?limit=100&cursor=…`.
- `limit` defaults to 50, capped at 200. Requesting more is a `400`, not a silent clamp — a silent
  clamp makes a client believe it fetched everything.
- Sorting is an allow-list per endpoint. Never interpolate a client-supplied sort field into SQL.

## 6. Filtering

Flat query params typed by the contract. No nested `filter[x][y]` syntax, no query DSL.

```
GET /api/v1/fees/vouchers?billingPeriodId=…&status=OVERDUE&status=PARTIALLY_PAID&minBalanceMinor=100000
```

Repeated params become arrays. Unknown params are **rejected** (`.strict()`), so a typo in a filter
name fails loudly instead of silently returning unfiltered data — the bug that leaks a whole table
into a report.

---

## 7. Mutations

- `POST` creates, `PATCH` partially updates, `PUT` is not used, `DELETE` soft-deletes where the
  entity supports it.
- **Every non-idempotent POST accepts an `Idempotency-Key` header.** Mandatory on payments, voucher
  generation, bulk sends and imports. Keys are stored for 24 hours with the original response, which
  is replayed on a repeat. This is what makes a double-clicked "Record Payment" button safe.
- Bulk endpoints take an array and return a per-item result — never all-or-nothing unless the
  operation is genuinely atomic:

```jsonc
POST /api/v1/students/bulk/assign-fee-plan
{ "studentIds": ["…"], "feePlanId": "…" }
→ { "data": { "succeeded": 480, "failed": 2,
      "results": [{ "id": "…", "ok": false, "code": "STUDENT_NOT_ACTIVE" }] } }
```

- State transitions are explicit endpoints, not a `PATCH { status }`. `POST /vouchers/:id/cancel`
  can require a reason, check invariants, and write a meaningful audit entry. A generic status patch
  can do none of those.

---

## 8. Auth on the wire

- Browser clients use **httpOnly cookies** (`ilm_at`, `ilm_rt`) — never `localStorage`.
- CSRF: `SameSite=Lax` plus a double-submit token on state-changing requests from the browser.
- Machine clients (future integrations, webhooks) use `Authorization: Bearer <api-key>` with
  per-school scoped keys.
- `POST /auth/refresh` rotates the refresh token; reuse of a consumed token revokes the family.

---

## 9. Rate limits

| Scope                  | Limit                                              |
| ---------------------- | -------------------------------------------------- |
| Global per IP          | 300 req/min                                        |
| Per authenticated user | 600 req/min                                        |
| Auth endpoints         | 10/min per IP + per-account exponential backoff    |
| Exports                | 10/hour per user                                   |
| Bulk messaging         | per-plan quota                                     |
| Job endpoints          | 1 concurrent run per (school, job) — advisory lock |

Responses carry `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`; `429` includes
`Retry-After`.

---

## 10. Webhooks (outbound, v2)

Schools can subscribe to `payment.received`, `voucher.generated`, `student.admitted`. Signed with
HMAC-SHA256 over the raw body (`X-Ilm-Signature`), timestamped to prevent replay, retried with
exponential backoff for 24 hours, with a delivery log in the school's settings.

## 11. Inbound webhooks (payment providers)

- Raw body preserved for signature verification **before** any parsing.
- Handler writes a `payment_events` row first, then processes. Idempotent on `provider_ref`.
- Always `200` on a duplicate — providers retry aggressively and a `4xx` on a duplicate causes a
  retry storm.
- Never trust an amount from a webhook without matching it against the voucher.

---

## 12. Documentation

- OpenAPI 3.1 generated from the zod contracts, served at `/docs`, published to `apps/docs`.
- Every endpoint carries a description, an example request and response, and its error codes.
- The spec is committed and diffed in CI: an unintended breaking change fails the build.
