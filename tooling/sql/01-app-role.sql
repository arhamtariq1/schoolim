-- The application connects as a role WITHOUT bypassrls. Migrations and the
-- platform/super-admin path connect as the owner, which does bypass it.
-- Two connection strings: DATABASE_URL and DATABASE_ADMIN_URL. See docs/04.
--
-- Idempotent, so it is safe to run against a fresh local database or an
-- existing hosted one.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ilm_app') THEN
    CREATE ROLE ilm_app WITH LOGIN PASSWORD 'ilm_local_dev' NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO ilm_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ilm_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ilm_app;
