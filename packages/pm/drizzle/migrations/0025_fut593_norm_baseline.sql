CREATE TABLE "pm"."kpi_norm_baseline" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"iso_year" integer NOT NULL,
	"iso_week" integer NOT NULL,
	"metric_id" uuid NOT NULL,
	"metric_version" integer NOT NULL,
	"category" text NOT NULL,
	"tier" text NOT NULL,
	"name" text NOT NULL,
	"formula_label" text NOT NULL,
	"component_count" integer NOT NULL,
	"component_1_label" text NOT NULL,
	"component_2_label" text,
	"green_band" jsonb NOT NULL,
	"yellow_band" jsonb NOT NULL,
	"red_band" jsonb NOT NULL,
	"insight" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_norm_baseline_category_check" CHECK (category IN ('quality', 'cost_capacity', 'delivery', 'process')),
	CONSTRAINT "kpi_norm_baseline_tier_check" CHECK (tier IN ('core', 'extended'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "kpi_norm_baseline_uniq" ON "pm"."kpi_norm_baseline" USING btree ("tenant_id","project_id","iso_year","iso_week","metric_id");--> statement-breakpoint
CREATE INDEX "kpi_norm_baseline_by_week" ON "pm"."kpi_norm_baseline" USING btree ("tenant_id","project_id","iso_year","iso_week");
--> statement-breakpoint
-- FUT-593 platform SQL: RLS for kpi_norm_baseline and a backfill for weeks that already
-- exist — drizzle-kit cannot model policies or data backfills.

-- Backfill BEFORE enabling RLS (see 0023 for the rationale): every (project, week) that
-- already has KPI data or flags gets a baseline copied from the metrics currently applied
-- to that project. Historical in-force definitions are unknowable (the catalog kept no
-- trail), so the current definitions are the best-available stand-in; runtime lazy-ensure
-- covers any week this INSERT cannot see through RLS on non-superuser runners.
INSERT INTO pm.kpi_norm_baseline
  (tenant_id, project_id, iso_year, iso_week, metric_id, metric_version, category, tier,
   name, formula_label, component_count, component_1_label, component_2_label,
   green_band, yellow_band, red_band, insight, sort_order)
SELECT DISTINCT w.tenant_id, w.project_id, w.iso_year, w.iso_week,
       m.id, m.version, m.category, m.tier,
       m.name, m.formula_label, m.component_count, m.component_1_label, m.component_2_label,
       m.green_band, m.yellow_band, m.red_band, m.insight, m.sort_order
FROM (
  SELECT tenant_id, project_id, iso_year, iso_week FROM pm.kpi_record
  UNION
  SELECT tenant_id, project_id, iso_year, iso_week FROM pm.flag
) w
JOIN pm.kpi_applied_metric am
  ON am.tenant_id = w.tenant_id AND am.project_id = w.project_id
JOIN pm.kpi_norm_metric m
  ON m.id = am.metric_id AND m.tenant_id = am.tenant_id
ON CONFLICT DO NOTHING;

-- rls backstop (app still writes explicit WHERE tenant_id)
ALTER TABLE pm.kpi_norm_baseline ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm.kpi_norm_baseline FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pm.kpi_norm_baseline
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
