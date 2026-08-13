-- RLS (hand-written — Drizzle can't model row-level security): tenant isolation for
-- the manual cycle-unlock audit log. The table carries its own tenant_id, so the
-- policy is the standard top-level tenant guard (see 0015 for the config tables).
-- FORCE so even the table owner is subject to it. Append-only is enforced in the
-- domain layer (INSERT only); RLS here bounds every row to the caller's tenant.
ALTER TABLE people.performance_cycle_unlock ENABLE ROW LEVEL SECURITY;
ALTER TABLE people.performance_cycle_unlock FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON people.performance_cycle_unlock
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
