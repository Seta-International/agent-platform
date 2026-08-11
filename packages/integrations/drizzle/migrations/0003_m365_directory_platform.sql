-- hand-written: Drizzle cannot express triggers, ROW LEVEL SECURITY, policies, or role grants.
-- Sections below are emitted by packages/integrations/drizzle/migrations/generate-platform-sql.ts
-- (@seta/shared-db buildTouchTriggerSql / buildRlsSql) for the new m365 directory sync tables
-- (FUT-842 Task 2): m365_person_links, m365_org_unit_links, m365_directory_conflict.
-- integrations.tg_touch_updated_at() already exists from 0001_integrations_platform.sql.

-- touch-updated-at
CREATE TRIGGER m365_person_links_touch_updated_at
BEFORE UPDATE ON integrations.m365_person_links
FOR EACH ROW EXECUTE FUNCTION integrations.tg_touch_updated_at();
CREATE TRIGGER m365_org_unit_links_touch_updated_at
BEFORE UPDATE ON integrations.m365_org_unit_links
FOR EACH ROW EXECUTE FUNCTION integrations.tg_touch_updated_at();
CREATE TRIGGER m365_directory_conflict_touch_updated_at
BEFORE UPDATE ON integrations.m365_directory_conflict
FOR EACH ROW EXECUTE FUNCTION integrations.tg_touch_updated_at();

-- rls (backstop; app still writes explicit WHERE tenant_id)
ALTER TABLE integrations.m365_person_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations.m365_person_links FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON integrations.m365_person_links
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER TABLE integrations.m365_org_unit_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations.m365_org_unit_links FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON integrations.m365_org_unit_links
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER TABLE integrations.m365_directory_conflict ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations.m365_directory_conflict FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON integrations.m365_directory_conflict
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Grants for the least-privilege app role. Guarded so self-host without the role still migrates.
-- 0001_integrations_platform.sql already set ALTER DEFAULT PRIVILEGES for this schema/role, but
-- we re-grant explicitly here too (belt-and-suspenders, matches 0004_people_user_projection_platform.sql).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'seta_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON integrations.m365_person_links TO seta_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON integrations.m365_org_unit_links TO seta_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON integrations.m365_directory_conflict TO seta_app';
  END IF;
END $$;
