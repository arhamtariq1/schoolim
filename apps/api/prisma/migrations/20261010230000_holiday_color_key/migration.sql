-- Calendar events can pick a display colour from a fixed palette (no raw hex).

ALTER TABLE "holidays"
  ADD COLUMN "color_key" TEXT NOT NULL DEFAULT 'rose';

ALTER TABLE "holidays"
  ADD CONSTRAINT "holidays_color_key_allowed"
  CHECK ("color_key" IN ('rose', 'amber', 'emerald', 'sky', 'violet', 'teal'));
