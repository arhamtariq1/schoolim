-- ---------------------------------------------------------------------------
-- The General Register number.
--
-- In a Pakistani school the General Register is the legal record of every child
-- who has ever attended, and the GR number is that child's entry in it. It is
-- issued once, never reused, never edited, and it outlives the student leaving.
--
-- Kept distinct from `admission_no` because the two answer different questions:
-- GR is "which entry in this school's register", admission is "which intake".
-- Many schools set them to the same value; that is a configuration, not a
-- reason to have one column.
--
-- Retention (CLAUDE.md): a GR number is erased with the student row it belongs
-- to, under the student retention rule in docs/17 §4. It is not separately
-- retained, because on its own it identifies nobody.
-- ---------------------------------------------------------------------------

-- Added nullable, backfilled, then made NOT NULL. Adding it NOT NULL outright
-- would fail on any table that already has rows.
ALTER TABLE "students" ADD COLUMN "gr_no" TEXT;

-- Backfill: number each school's existing students by admission order, so the
-- register reads in the order children actually joined rather than by row id.
WITH numbered AS (
  SELECT
    id,
    school_id,
    ROW_NUMBER() OVER (
      PARTITION BY school_id
      ORDER BY COALESCE(admitted_on, created_at::date), created_at, id
    ) AS seq
  FROM "students"
)
UPDATE "students" AS s
SET "gr_no" = LPAD(numbered.seq::text, 4, '0')
FROM numbered
WHERE s.id = numbered.id;

ALTER TABLE "students" ALTER COLUMN "gr_no" SET NOT NULL;

CREATE UNIQUE INDEX "students_school_id_gr_no_key" ON "students"("school_id", "gr_no");
CREATE INDEX "students_school_id_gr_no_idx" ON "students"("school_id", "gr_no");

-- Advance each school's `gr` counter past whatever was just backfilled, so the
-- next admission cannot be handed a number that already exists. Without this
-- the first real admission after this migration collides on the unique index —
-- after the receptionist has filled in the whole form.
INSERT INTO "number_sequences" ("id", "school_id", "kind", "next_value", "updated_at")
SELECT
  gen_random_uuid(),
  s.school_id,
  'gr',
  COALESCE(MAX(s.gr_no::int), 0) + 1,
  now()
FROM "students" s
GROUP BY s.school_id
ON CONFLICT ("school_id", "kind") DO UPDATE
  SET "next_value" = GREATEST("number_sequences"."next_value", EXCLUDED."next_value"),
      "updated_at" = now();

COMMENT ON COLUMN "students"."gr_no" IS
  'General Register number. Permanent, never reused, allocated from number_sequences(kind=''gr'').';
