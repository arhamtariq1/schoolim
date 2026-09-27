-- An agreed fee starts when the child joined, not when somebody typed it in.
--
-- `student_fees.effective_from` defaults to `now()`, and the admission path
-- never set it — so every fee agreed at admission began on the day the record
-- was entered. That is the same day for a walk-in and wrong in both directions
-- for everybody else:
--
--   * A school entering last year's register got fees starting today, so none
--     of that history could be billed — every month before today reported "no
--     agreed amount".
--   * A school admitting next term's intake early got fees starting today, so
--     those children would be billed for every month between now and the day
--     they actually arrive. That one takes money off a family for months their
--     child was not there, which is why this migration exists rather than only
--     the code fix.
--
-- Only the **earliest** row per (student, head) is moved. That is the one
-- written at admission; anything after it is an increment, which carries a date
-- somebody chose deliberately and must not be touched.
--
-- Rows that would collide are left alone. `(school_id, student_id, fee_head_id,
-- effective_from)` is unique, so a student who already has a row dated exactly
-- on their admission day is already correct and needs nothing.
--
-- Issued vouchers are unaffected: a voucher stores the amounts it was raised
-- with, so nothing that has already been billed or receipted changes.
WITH earliest AS (
  SELECT DISTINCT ON (sf.school_id, sf.student_id, sf.fee_head_id)
         sf.id, sf.school_id, sf.student_id, sf.fee_head_id, s.admitted_on
    FROM student_fees sf
    JOIN students s ON s.id = sf.student_id
   WHERE s.admitted_on IS NOT NULL
     AND sf.effective_from <> s.admitted_on
   ORDER BY sf.school_id, sf.student_id, sf.fee_head_id, sf.effective_from ASC
)
UPDATE student_fees sf
   SET effective_from = e.admitted_on,
       updated_at = now()
  FROM earliest e
 WHERE sf.id = e.id
   AND NOT EXISTS (
     SELECT 1 FROM student_fees other
      WHERE other.school_id = e.school_id
        AND other.student_id = e.student_id
        AND other.fee_head_id = e.fee_head_id
        AND other.effective_from = e.admitted_on
   );
