-- Staff roles: HEAD becomes PRINCIPAL, JANITOR becomes PEON, and OTHERS is new.
--
-- RENAME VALUE rewrites the label in the type, not in the rows, so every
-- existing staff member keeps their role under its new name and nothing is
-- backfilled. Reverse: rename PRINCIPAL -> HEAD and PEON -> JANITOR (OTHERS
-- cannot be dropped from an enum, so rows using it must be moved first).

ALTER TYPE "staff_role" RENAME VALUE 'HEAD' TO 'PRINCIPAL';
ALTER TYPE "staff_role" RENAME VALUE 'JANITOR' TO 'PEON';
ALTER TYPE "staff_role" ADD VALUE IF NOT EXISTS 'OTHERS';
