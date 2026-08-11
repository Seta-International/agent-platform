-- RLS (hand-written — Drizzle can't model row-level security): defense-in-depth
-- tenant isolation for the revision-scoped child tables. They carry no tenant_id
-- of their own, so the policy derives the tenant from the parent
-- performance_config_revision row (which itself is tenant-isolated + FORCE RLS).
-- Without this, a query by an unauthorized revision_id would bypass tenancy.
ALTER TABLE people.performance_config_group_weight ENABLE ROW LEVEL SECURITY;
ALTER TABLE people.performance_config_group_weight FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON people.performance_config_group_weight
  USING (
    EXISTS (
      SELECT 1 FROM people.performance_config_revision r
      WHERE r.id = revision_id
        AND r.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM people.performance_config_revision r
      WHERE r.id = revision_id
        AND r.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    )
  );

ALTER TABLE people.performance_config_criterion ENABLE ROW LEVEL SECURITY;
ALTER TABLE people.performance_config_criterion FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON people.performance_config_criterion
  USING (
    EXISTS (
      SELECT 1 FROM people.performance_config_revision r
      WHERE r.id = revision_id
        AND r.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM people.performance_config_revision r
      WHERE r.id = revision_id
        AND r.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    )
  );
