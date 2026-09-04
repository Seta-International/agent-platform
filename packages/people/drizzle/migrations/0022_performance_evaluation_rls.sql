-- RLS (hand-written — Drizzle can't model row-level security): tenant isolation for
-- the evaluation tables. Both carry their own tenant_id (the score child denormalizes
-- it precisely so the same top-level guard applies without a join), so each gets the
-- standard tenant policy. FORCE so even the table owner is subject to it.
ALTER TABLE people.performance_evaluation ENABLE ROW LEVEL SECURITY;
ALTER TABLE people.performance_evaluation FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON people.performance_evaluation
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE people.performance_evaluation_score ENABLE ROW LEVEL SECURITY;
ALTER TABLE people.performance_evaluation_score FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON people.performance_evaluation_score
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
