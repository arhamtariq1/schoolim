-- A school may edit its own details after onboarding, not only during it.
--
-- `20260924000000_school_onboarding_grant` gave `ilm_app` the columns the
-- first-login form fills. That form runs exactly once — it refuses on a school
-- that is already onboarded — which left the name, contact details and address
-- frozen at whatever was typed in the account's first five minutes, on a record
-- printed at the top of every challan and every receipt.
--
-- Two columns are new here. The rest were already granted by the onboarding
-- migration, and `GRANT` is additive, so listing them again is harmless and
-- keeps this file readable as the whole of what settings may write.
--
-- Still withheld, deliberately:
--
--   * `slug`     — the onboarding grant includes it because a school may fix
--                  its address while it is still unfinished. Settings must not,
--                  and does not: the endpoint never names the column. The grant
--                  is the weaker of the two guards here, so the check that
--                  matters is in `school-settings.service.ts`.
--   * `currency`, `country` — every amount already recorded was recorded in the
--                  school's currency. Relabelling it converts nothing; it
--                  silently restates every historical voucher and payment.
--   * `status`, `school_group_id`, `trial_ends_at` — the platform console's.
--                  A school suspended for non-payment must not be able to
--                  unsuspend itself, and RLS does not stop it from writing its
--                  own row. This grant does.
--
-- `updated_at` because Prisma stamps `@updatedAt` on every update; without it
-- the statement is refused naming the table rather than the missing column.
GRANT UPDATE (
  "name",
  "legal_name",
  "address",
  "city",
  "phone",
  "email",
  "timezone",
  "locale",
  "updated_at"
) ON "schools" TO ilm_app;
