-- GR numbers may carry a letter prefix (A-1001, GR/2026-0001). The prefix lives
-- beside the counter it belongs to; every existing row gets '' and so keeps
-- producing plain numbers exactly as before.
--
-- Reverse: ALTER TABLE "number_sequences" DROP COLUMN "prefix";

ALTER TABLE "number_sequences" ADD COLUMN "prefix" TEXT NOT NULL DEFAULT '';
