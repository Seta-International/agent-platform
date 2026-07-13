-- hand-written: Drizzle cannot express triggers, ROW LEVEL SECURITY, policies, or role grants.
-- Sections below are emitted by packages/people/drizzle/generate-platform-sql.ts
-- (@seta/shared-db buildTouchTriggerSql / buildRlsSql) for the new people.user_projection table.

-- touch-updated-at
CREATE TRIGGER user_projection_touch_updated_at
BEFORE UPDATE ON people.user_projection
FOR EACH ROW EXECUTE FUNCTION people.tg_touch_updated_at();

-- rls (backstop; app still writes explicit WHERE tenant_id)
ALTER TABLE people.user_projection ENABLE ROW LEVEL SECURITY;
ALTER TABLE people.user_projection FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON people.user_projection
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'seta_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON people.user_projection TO seta_app';
  END IF;
END $$;
