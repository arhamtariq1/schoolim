-- ===========================================================================
-- Close a cross-tenant leak: RLS on a partitioned parent does NOT protect a
-- partition queried directly.
--
-- `audit_logs` had ENABLE + FORCE ROW LEVEL SECURITY and a tenant_isolation
-- policy, which covers every query that goes through the parent — which is
-- every query Prisma makes. But PostgreSQL evaluates row security against the
-- relation named in the query, so:
--
--     SELECT * FROM audit_logs_2026_08;
--
-- read every school's audit rows. The application role reaches the partitions
-- because privileges granted on a partitioned table propagate to its
-- partitions, while the parent's RLS does not.
--
-- Found by probing the deployed database rather than by reading the schema:
-- the parent looked correct in every introspection.
--
-- Fix: every partition carries its own RLS and its own policy. The helper
-- below is used here and by the monthly maintenance job, so a partition
-- created next year cannot be created unprotected.
-- ===========================================================================

CREATE OR REPLACE FUNCTION secure_audit_partition(partition_name text) RETURNS void
  LANGUAGE plpgsql
  AS $$
BEGIN
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', partition_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', partition_name);

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = partition_name AND policyname = 'tenant_isolation'
  ) THEN
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (school_id = current_school_id()) WITH CHECK (school_id = current_school_id())',
      partition_name
    );
  END IF;
END
$$;

COMMENT ON FUNCTION secure_audit_partition(text) IS
  'Applies RLS and the tenant policy to one audit_logs partition. A partition without these is readable across tenants.';

-- Every partition that already exists, including the DEFAULT.
DO $$
DECLARE
  child text;
BEGIN
  FOR child IN
    SELECT c.relname
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    WHERE p.relname = 'audit_logs'
  LOOP
    PERFORM secure_audit_partition(child);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- Creating a month's partition, protected by construction.
--
-- The monthly maintenance job calls this rather than issuing CREATE TABLE
-- itself, so there is no path that produces an unprotected partition.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ensure_audit_partition(month_start date) RETURNS text
  LANGUAGE plpgsql
  AS $$
DECLARE
  partition_name text := 'audit_logs_' || to_char(month_start, 'YYYY_MM');
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_logs FOR VALUES FROM (%L) TO (%L)',
    partition_name,
    month_start,
    (month_start + interval '1 month')::date
  );

  PERFORM secure_audit_partition(partition_name);
  RETURN partition_name;
END
$$;

COMMENT ON FUNCTION ensure_audit_partition(date) IS
  'Creates a month partition of audit_logs with RLS applied. Use this, never a bare CREATE TABLE.';
