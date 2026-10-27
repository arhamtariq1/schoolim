-- Decision D2, as made by the product owner on 2026-10-27: two paid plans, a
-- free trial and a custom plan. Only the two paid plans are rows — the trial is
-- `TRIAL_DAYS` and the custom plan has no price, so neither is a plan a school
-- subscribes to. The yearly price is derived from the monthly one with
-- `ANNUAL_DISCOUNT_BPS` in @ilm/contracts, not stored.
--
-- The placeholder plans are archived, not deleted: a plan is configuration a
-- subscription may later point at, and archiving is how the console retires
-- one. Reversing this migration is the same move the other way — archive
-- `solo` and `team`, and clear `archived_at` on the three below.

UPDATE "plans"
SET "archived_at" = now(), "is_public" = false, "updated_at" = now()
WHERE "code" IN ('starter', 'standard', 'group') AND "archived_at" IS NULL;

INSERT INTO "plans" ("id", "code", "name", "tagline", "price", "student_cap", "features", "is_recommended", "sort_order") VALUES
  (gen_random_uuid(), 'solo', 'Solo', 'One Admin login that can do everything', 3999.00, NULL,
    ARRAY['One Admin login with full access','Students, admissions and guardians','Fee vouchers, defaulters and deposits','Attendance, marks and result cards','Revenue, expenses and salaries'], false, 10),
  (gen_random_uuid(), 'team', 'Team', 'Your whole staff, each in their own role', 5999.00, NULL,
    ARRAY['Everything in Solo','Principal, accountant, teacher and office roles','A portal for every parent','Access set per role and per person','Requests between parents and the office'], true, 20)
ON CONFLICT ("code") DO NOTHING;
