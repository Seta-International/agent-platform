-- drizzle-kit cannot express ROW LEVEL SECURITY policies or role grants; hand-written
-- alongside the generated table DDL, matching the core pattern in 0001_core_platform.sql.
ALTER TABLE core.mutation_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.mutation_idempotency FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.mutation_idempotency
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Grants for the least-privilege app role. Guarded so self-host without the role still migrates.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'seta_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON core.mutation_idempotency TO seta_app';
  END IF;
END $$;
