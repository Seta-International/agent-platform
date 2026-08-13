-- FUT-797 KPI metric entry rules, in one file: the three sections must land together or the
-- catalog is inconsistent (columns with no values would silently validate on the permissive
-- defaults). drizzle-kit generates the DDL but never data, so the two backfills are hand-written
-- alongside it (see .claude/rules/backend.md).
--
-- 1. Trim 3 KPI Norm insight strings back to the SETA-08-SOP-001 source (docs/weekly.html KPI Norm
--    mockup) for tenants seeded before this fix. insight is not in the
--    pm.tg_kpi_norm_metric_immutable protected tuple, so no version bump is needed. Each UPDATE
--    has an IS DISTINCT FROM guard, so a row already trimmed is not touched.
-- 2. Add the five entry-rule columns to pm.kpi_norm_metric and pm.kpi_norm_baseline.
-- 3. Backfill both tables. ensureKpiNormSeeded is ON CONFLICT DO NOTHING, so tenants seeded before
--    FUT-797 keep their catalog rows and would otherwise run on the column defaults forever.
--    Frozen week baselines are copies of the catalog by metric_id, so they take the same values.

UPDATE pm.kpi_norm_metric SET
  insight = 'Long-lived defects = growing backlog, blocked tests.'
WHERE name = 'MTTR — Defect'
  AND insight IS DISTINCT FROM 'Long-lived defects = growing backlog, blocked tests.';
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'Drift = lower productivity or wrong rate-card.'
WHERE name = 'Cost Per Story Point'
  AND insight IS DISTINCT FROM 'Drift = lower productivity or wrong rate-card.';
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'DORA #1 — Elite = on-demand.'
WHERE name = 'Deployment Frequency'
  AND insight IS DISTINCT FROM 'DORA #1 — Elite = on-demand.';
--> statement-breakpoint
ALTER TABLE "pm"."kpi_norm_baseline" ADD COLUMN "component_1_integer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pm"."kpi_norm_baseline" ADD COLUMN "component_2_integer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pm"."kpi_norm_baseline" ADD COLUMN "component_1_min" numeric(15, 4);--> statement-breakpoint
ALTER TABLE "pm"."kpi_norm_baseline" ADD COLUMN "component_1_max" numeric(15, 4);--> statement-breakpoint
ALTER TABLE "pm"."kpi_norm_baseline" ADD COLUMN "is_share" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pm"."kpi_norm_metric" ADD COLUMN "component_1_integer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pm"."kpi_norm_metric" ADD COLUMN "component_2_integer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pm"."kpi_norm_metric" ADD COLUMN "component_1_min" numeric(15, 4);--> statement-breakpoint
ALTER TABLE "pm"."kpi_norm_metric" ADD COLUMN "component_1_max" numeric(15, 4);--> statement-breakpoint
ALTER TABLE "pm"."kpi_norm_metric" ADD COLUMN "is_share" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "pm"."kpi_norm_metric" AS m SET
  "component_1_integer" = v.c1_integer,
  "component_2_integer" = v.c2_integer,
  "component_1_min" = v.c1_min,
  "component_1_max" = v.c1_max,
  "is_share" = v.is_share
FROM (
  VALUES
    ('Defect Leakage', true, true, 0, null, true),
    ('Internal Defect Density', true, false, 0, null, false),
    ('Reopened Defect Rate', true, true, 0, null, true),
    ('Defect Removal Efficiency (DRE)', true, true, 0, null, true),
    ('Tech Health Investment (THI)', false, false, 0, null, true),
    ('MTTD — Defect', false, false, 0, null, false),
    ('MTTR — Defect', false, false, 0, null, false),
    ('Critical Defect Aging', true, false, 0, null, false),
    ('Code Coverage', true, true, 0, null, true),
    ('Static Analysis Issue Density', true, false, 0, null, false),
    ('Review Effectiveness', true, true, 0, null, true),
    ('Effort Consumption', false, false, 0, null, false),
    ('Margin', false, false, null, null, true),
    ('Billable Rate', false, false, 0, null, true),
    ('Utilization Rate', false, false, 0, null, false),
    ('Busy Rate', false, false, 0, null, false),
    ('eNPS / CSS', false, false, 1, 5, false),
    ('Cost Per Story Point', false, false, 0, null, false),
    ('Revenue Per BMM', false, false, 0, null, false),
    ('Attrition Rate (rolling 12m)', true, false, 0, null, false),
    ('Bench Rate', false, false, 0, null, true),
    ('Overtime Ratio', false, false, 0, null, false),
    ('Onboarding Ramp-up Time', false, false, 0, null, false),
    ('On-time Delivery', true, true, 0, null, true),
    ('Completed Effectiveness (CE)', false, false, 0, null, false),
    ('Release Predictability', false, false, 0, null, false),
    ('Schedule Performance Index (SPI)', false, false, 0, null, false),
    ('Forecast Accuracy', false, false, 0, null, false),
    ('Deployment Frequency', true, true, 0, null, false),
    ('Lead Time for Changes', false, false, 0, null, false),
    ('Change Failure Rate (CFR)', true, true, 0, null, true),
    ('MTTR — Production', false, false, 0, null, false),
    ('Time-to-Market (Feature Cycle Time)', false, false, 0, null, false),
    ('Customer Acceptance Lead Time', false, false, 0, null, false),
    ('PCV (Process Compliance)', true, true, 0, null, true),
    ('Innovation Index', true, false, 0, null, false),
    ('Audit Compliance Rate', true, true, 0, null, true),
    ('Retrospective Action Closure Rate', true, true, 0, null, true),
    ('CAPA Closure Rate', true, true, 0, null, true),
    ('Risk Closure Rate', true, true, 0, null, true),
    ('Risk Identification Lead Time', true, false, -49, 49, false),
    ('Documentation Currency Rate', true, true, 0, null, true),
    ('Training Compliance Rate', true, true, 0, null, true),
    ('Lessons Learned Adoption Rate', true, true, 0, null, true)
) AS v(name, c1_integer, c2_integer, c1_min, c1_max, is_share)
WHERE m."name" = v.name;--> statement-breakpoint
UPDATE "pm"."kpi_norm_baseline" AS b SET
  "component_1_integer" = m."component_1_integer",
  "component_2_integer" = m."component_2_integer",
  "component_1_min" = m."component_1_min",
  "component_1_max" = m."component_1_max",
  "is_share" = m."is_share"
FROM "pm"."kpi_norm_metric" AS m
WHERE b."metric_id" = m."id" AND b."tenant_id" = m."tenant_id";
