-- First-login school onboarding may set the school's own identity fields.
--
-- `ilm_app` already has a narrow UPDATE grant for late-fee settings
-- (20260913000000). Onboarding needs the same pattern for the columns the
-- owner fills on `/profile/create`: name, contact details, locale, and the
-- `onboarded_at` stamp that unlocks the rest of the portal.
--
-- Slug is included deliberately. RLS still confines the row to
-- `id = current_school_id()`, and `schools_slug_key` refuses a collision —
-- so a school can rename its own address while it is unfinished, and cannot
-- steal another school's. Status, plan and group remain ungreatable here.
--
-- `updated_at` again: Prisma stamps `@updatedAt` on every update, so without
-- it the statement is refused for a reason that names the table, not the
-- missing column.
GRANT UPDATE (
  "name",
  "slug",
  "city",
  "phone",
  "email",
  "timezone",
  "locale",
  "onboarded_at",
  "updated_at"
) ON "schools" TO ilm_app;
