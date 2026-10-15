-- Make staff_salary_payments genuinely append-only for the application role.
--
-- The previous migration granted SELECT and INSERT and said so in a comment, but
-- new tables here also receive the role's default privileges (UPDATE, DELETE and
-- more), so the narrow GRANT narrowed nothing. A test reading the real grants
-- caught it. Revoking first is what actually enforces docs/12 R4: after this, no
-- code path can change a recorded payment, whatever a future service tries.

REVOKE ALL ON "staff_salary_payments" FROM ilm_app;
GRANT SELECT, INSERT ON "staff_salary_payments" TO ilm_app;
