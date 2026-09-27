-- An invitation names the account it is for.
--
-- `invitations` has always carried an email and a role but not a user. That was
-- fine while an invitation was a promise of an account; it is not fine now that
-- accepting one sets a password on an account that already exists, because the
-- only way to find that account would be to look a user up by the email on the
-- invitation.
--
-- Which is a real bug, not a tidiness point: a school that invites
-- `teacher@example.com`, corrects the address to `t.khan@example.com`, and then
-- watches the first invitation get accepted would set a password on whichever
-- account happens to hold the old address — or, worse, on nobody, silently.
-- Naming the user removes the guess.
--
-- Nullable, because rows written before this migration have no user to point
-- at, and an invitation that cannot name one is simply refused at accept time.
ALTER TABLE "invitations" ADD COLUMN "user_id" uuid;

ALTER TABLE "invitations"
  ADD CONSTRAINT "invitations_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

-- Leading with `school_id`, as every tenant-scoped index here does: RLS confines
-- the rows, and the index has to serve one school's lookups rather than a scan
-- across all of them.
CREATE INDEX "invitations_school_id_user_id_idx" ON "invitations" ("school_id", "user_id");
