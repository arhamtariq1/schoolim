-- ---------------------------------------------------------------------------
-- The application role's grant on the schema itself, so a reset cannot take it.
--
-- `prisma migrate reset` drops and recreates `public`. Recreating a schema
-- recreates its default privileges, so every `GRANT USAGE ON SCHEMA public TO
-- ilm_app` made outside the migrations — by `provision-app-role.mjs`, the only
-- place it lived — is gone the moment anybody resets.
--
-- What that looks like is the confusing part. The tables are all there, their
-- table-level grants are all intact, and every request fails with
--
--   permission denied for schema public
--
-- which reads like the schema is missing rather than like one grant is. It cost
-- an afternoon once; it should not cost a second one.
--
-- So the grant lives here, in the chain, where a reset re-applies it along with
-- everything else. `provision-app-role.mjs` still grants it too — that script
-- has to work on a database with no migrations applied yet — and granting a
-- privilege twice is a no-op.
--
-- The role must already exist, which it does: the very first migration GRANTs
-- table privileges to `ilm_app` by name and would fail without it.
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO ilm_app;

-- Tables and sequences created by *later* migrations, so a new table does not
-- need its own GRANT line to be readable. The per-table grants in each
-- migration stay: they are how a table gets narrower rights than the default,
-- which is what `security_deposit_refunds` needs to be append-only.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ilm_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ilm_app;
