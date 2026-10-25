# ADR-0018 — Parents read fee vouchers through their own routes

- Status: Accepted
- Date: 2026-10-18

## Context

The office generates fee vouchers; the guardian of each child must find them on a
Fee Vouchers page, be told when one is issued, see its payment status, and
preview and download it as a PDF under the school's Voucher Settings.

## Decisions

1. **Dedicated parent routes, not the staff ones.** `GET /parent/vouchers` and
   `/parent/vouchers/:id` start at the signed-in guardian (`guardians.user_id`),
   like the rest of the parent portal. The staff voucher routes are gated by
   `fees.voucher.read`; giving a parent that permission as a `SCOPED` grant would
   open every staff voucher query that does not narrow its rows. A new permission,
   `parent.voucher.read`, is held by PARENT alone. A voucher that is another
   family's, cancelled, or absent is the same 404.
2. **One calculation, one layout.** The parent's figures come from the same
   `VouchersService` rows and mapping as the office's list and challan, and the
   challan is the office's `VoucherChallan` under the school's Voucher Settings,
   logo and bank marks. The school and bank marks are served from parent routes
   (`/parent/voucher-assets/…`) because their staff routes need permissions a
   guardian does not hold.
3. **Overdue is derived.** The ledger knows UNPAID, PARTIALLY_PAID, PAID, WAIVED.
   The parent also reads OVERDUE: owing something past the due date. Precedence:
   paid, waived, overdue, part-paid, unpaid. The filter applies the same rule as a
   `where`, so the filter and the badge cannot disagree.
4. **The notification is written in the generating transaction**, through
   `NotificationsService.notifyMany`. It exists exactly when its voucher does: none
   for a failed run, a voucher that won no periods, or a chunk that rolled back; and
   a re-sent run (same idempotency key) never reaches it twice.
5. **A modal, not a page; the PDF is made in the browser.** "View" opens the voucher
   in a modal over the list — a notification links to `/parent/vouchers?open=<id>`,
   which opens it — so there is no voucher page to maintain. "PDF" draws the same
   `VoucherChallan` and saves it as an A4 file (landscape for three copies, portrait
   for four) with `html2canvas-pro` and `jspdf`, loaded on the click. The file is a
   picture of the challan, so it is exactly what Voucher Settings produce; a server
   PDF writer would make selectable text and is the later upgrade.
6. **No Supabase.** The brief mentions Supabase RLS. This project is Postgres with
   its own row-level security; no table was added, so the existing policies on
   `fee_vouchers`, `guardians` and `notifications` are the isolation.

## Consequences

- A guardian without a portal login (no email) is not notified; the voucher is
  still theirs to print at the office.
- A change to a voucher after issue (dates, a payment) updates the page and the
  status, but sends no new notification.
