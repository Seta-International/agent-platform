-- Touch triggers, RLS policies, latest-entry FK, and the flag-audit append-only guard for the
-- FUT-609 reporting tables (reconciled with FUT-581): drizzle-kit cannot model
-- triggers/policies. The touch + RLS sections are generated verbatim by
-- packages/pm/drizzle/generate-platform-sql.ts (@seta/shared-db builders);
-- pm.tg_touch_updated_at() already exists from 0001_pm_platform.sql.

-- touch-updated-at triggers (mutable tables only; flag_audit_entry and norm_snapshot are
-- append-only/immutable and excluded)
CREATE TRIGGER report_touch_updated_at
BEFORE UPDATE ON pm.report
FOR EACH ROW EXECUTE FUNCTION pm.tg_touch_updated_at();
CREATE TRIGGER metric_value_touch_updated_at
BEFORE UPDATE ON pm.metric_value
FOR EACH ROW EXECUTE FUNCTION pm.tg_touch_updated_at();
CREATE TRIGGER flag_touch_updated_at
BEFORE UPDATE ON pm.flag
FOR EACH ROW EXECUTE FUNCTION pm.tg_touch_updated_at();
CREATE TRIGGER project_week_rollup_touch_updated_at
BEFORE UPDATE ON pm.project_week_rollup
FOR EACH ROW EXECUTE FUNCTION pm.tg_touch_updated_at();
CREATE TRIGGER comment_touch_updated_at
BEFORE UPDATE ON pm.comment
FOR EACH ROW EXECUTE FUNCTION pm.tg_touch_updated_at();

-- rls backstop (all seven; app still writes explicit WHERE tenant_id)
ALTER TABLE pm.report ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm.report FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pm.report
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER TABLE pm.metric_value ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm.metric_value FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pm.metric_value
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER TABLE pm.flag ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm.flag FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pm.flag
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER TABLE pm.flag_audit_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm.flag_audit_entry FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pm.flag_audit_entry
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER TABLE pm.norm_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm.norm_snapshot FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pm.norm_snapshot
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER TABLE pm.project_week_rollup ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm.project_week_rollup FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pm.project_week_rollup
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER TABLE pm.comment ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm.comment FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pm.comment
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- flag.latest_audit_entry_id → flag_audit_entry(id); set-null on delete avoids the FK cycle
ALTER TABLE pm.flag
  ADD CONSTRAINT flag_latest_audit_entry_fk
  FOREIGN KEY (latest_audit_entry_id) REFERENCES pm.flag_audit_entry(id) ON DELETE SET NULL;

-- append-only guard: pm.flag_audit_entry rows are never updated or deleted
CREATE FUNCTION pm.tg_flag_audit_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'pm.flag_audit_entry is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER flag_audit_entry_append_only
  BEFORE UPDATE OR DELETE ON pm.flag_audit_entry
  FOR EACH ROW EXECUTE FUNCTION pm.tg_flag_audit_append_only();
