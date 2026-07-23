-- data backfill (FUT-740): localize KPI Norm metric copy VI -> EN for tenants seeded
-- before the seed itself was translated. drizzle-kit cannot model a data backfill, so this is
-- hand-written. Values mirror KPI_NORM_METRICS (kpi-norm-data.ts) at this revision.
--
-- Runs against every tenant's rows. Idempotent: each UPDATE has an IS DISTINCT FROM / equality
-- guard, so a row already in English is not touched (no updated_at churn, no trigger work).
--
-- Only display-only columns are bulk-updated (insight, component_1_label, component_2_label):
-- these are NOT in the pm.tg_kpi_norm_metric_immutable protected tuple
-- (green/yellow/red_band, formula_label, component_count, category), so they may change on a
-- published+referenced metric. The single formula_label change (eNPS/CSS) IS protected, so it is
-- applied with a version bump, exactly as the trigger's error message instructs.

UPDATE pm.kpi_norm_metric SET
  insight = 'Quality gate tightness — Red = QA system failure or release pressure.',
  component_1_label = 'Production defects',
  component_2_label = 'Total defects'
WHERE name = 'Defect Leakage'
  AND (
    insight IS DISTINCT FROM 'Quality gate tightness — Red = QA system failure or release pressure.'
    OR component_1_label IS DISTINCT FROM 'Production defects'
    OR component_2_label IS DISTINCT FROM 'Total defects'
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = '< 0.5 suggests under-reporting; > 4 = overload or skill gap.',
  component_1_label = 'Internal defects',
  component_2_label = 'BMM'
WHERE name = 'Internal Defect Density'
  AND (
    insight IS DISTINCT FROM '< 0.5 suggests under-reporting; > 4 = overload or skill gap.'
    OR component_1_label IS DISTINCT FROM 'Internal defects'
    OR component_2_label IS DISTINCT FROM 'BMM'
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'Fix quality — Red = shallow fixes, missing root cause.',
  component_1_label = 'Reopened defects',
  component_2_label = 'Total defects closed'
WHERE name = 'Reopened Defect Rate'
  AND (
    insight IS DISTINCT FROM 'Fix quality — Red = shallow fixes, missing root cause.'
    OR component_1_label IS DISTINCT FROM 'Reopened defects'
    OR component_2_label IS DISTINCT FROM 'Total defects closed'
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'Red = customers are finding your bugs for you.',
  component_1_label = 'Internal defects',
  component_2_label = 'Internal + external defects'
WHERE name = 'Defect Removal Efficiency (DRE)'
  AND (
    insight IS DISTINCT FROM 'Red = customers are finding your bugs for you.'
    OR component_1_label IS DISTINCT FROM 'Internal defects'
    OR component_2_label IS DISTINCT FROM 'Internal + external defects'
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = '< 10% = sacrificing architecture, will pay later; > 35% = over-investment.',
  component_1_label = 'Non-dev effort',
  component_2_label = 'Total effort'
WHERE name = 'Tech Health Investment (THI)'
  AND (
    insight IS DISTINCT FROM '< 10% = sacrificing architecture, will pay later; > 35% = over-investment.'
    OR component_1_label IS DISTINCT FROM 'Non-dev effort'
    OR component_2_label IS DISTINCT FROM 'Total effort'
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'Slow detection → fix cost grows exponentially.',
  component_1_label = 'Avg days (found − injected)',
  component_2_label = NULL
WHERE name = 'MTTD — Defect'
  AND (
    insight IS DISTINCT FROM 'Slow detection → fix cost grows exponentially.'
    OR component_1_label IS DISTINCT FROM 'Avg days (found − injected)'
    OR component_2_label IS DISTINCT FROM NULL
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'Long-lived defects = growing backlog, blocked tests. Simplified: use the Sev1 threshold (stricter than Sev2) as a single value.',
  component_1_label = 'Avg resolve time, worse severity (days)',
  component_2_label = NULL
WHERE name = 'MTTR — Defect'
  AND (
    insight IS DISTINCT FROM 'Long-lived defects = growing backlog, blocked tests. Simplified: use the Sev1 threshold (stricter than Sev2) as a single value.'
    OR component_1_label IS DISTINCT FROM 'Avg resolve time, worse severity (days)'
    OR component_2_label IS DISTINCT FROM NULL
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'Zombie critical bug = escalation broken.',
  component_1_label = '# Sev1/Sev2 defects aged beyond SLA',
  component_2_label = NULL
WHERE name = 'Critical Defect Aging'
  AND (
    insight IS DISTINCT FROM 'Zombie critical bug = escalation broken.'
    OR component_1_label IS DISTINCT FROM '# Sev1/Sev2 defects aged beyond SLA'
    OR component_2_label IS DISTINCT FROM NULL
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = '< 60% = regressions hard to control.',
  component_1_label = 'Lines covered',
  component_2_label = 'Total lines'
WHERE name = 'Code Coverage'
  AND (
    insight IS DISTINCT FROM '< 60% = regressions hard to control.'
    OR component_1_label IS DISTINCT FROM 'Lines covered'
    OR component_2_label IS DISTINCT FROM 'Total lines'
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'Red = CI quality gate being bypassed.',
  component_1_label = 'Critical+High issues',
  component_2_label = 'KLOC'
WHERE name = 'Static Analysis Issue Density'
  AND (
    insight IS DISTINCT FROM 'Red = CI quality gate being bypassed.'
    OR component_1_label IS DISTINCT FROM 'Critical+High issues'
    OR component_2_label IS DISTINCT FROM 'KLOC'
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'Red = reviews are just rubber-stamping.',
  component_1_label = 'Defects found in review',
  component_2_label = 'Total pre-prod defects'
WHERE name = 'Review Effectiveness'
  AND (
    insight IS DISTINCT FROM 'Red = reviews are just rubber-stamping.'
    OR component_1_label IS DISTINCT FROM 'Defects found in review'
    OR component_2_label IS DISTINCT FROM 'Total pre-prod defects'
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = '< 75% = under-planning; > 120% = blow-out.',
  component_1_label = 'Actual effort',
  component_2_label = 'Planned effort'
WHERE name = 'Effort Consumption'
  AND (
    insight IS DISTINCT FROM '< 75% = under-planning; > 120% = blow-out.'
    OR component_1_label IS DISTINCT FROM 'Actual effort'
    OR component_2_label IS DISTINCT FROM 'Planned effort'
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = '< 15% = a single risk event turns a loss.',
  component_1_label = 'Margin (Revenue − Cost)',
  component_2_label = 'Revenue'
WHERE name = 'Margin'
  AND (
    insight IS DISTINCT FROM '< 15% = a single risk event turns a loss.'
    OR component_1_label IS DISTINCT FROM 'Margin (Revenue − Cost)'
    OR component_2_label IS DISTINCT FROM 'Revenue'
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'Red = too much overhead, meetings, rework.',
  component_1_label = 'Billable hours',
  component_2_label = 'Total worked hours'
WHERE name = 'Billable Rate'
  AND (
    insight IS DISTINCT FROM 'Red = too much overhead, meetings, rework.'
    OR component_1_label IS DISTINCT FROM 'Billable hours'
    OR component_2_label IS DISTINCT FROM 'Total worked hours'
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = '> 100% = burnout risk; < 60% = bench.',
  component_1_label = 'Worked hours',
  component_2_label = 'Available hours'
WHERE name = 'Utilization Rate'
  AND (
    insight IS DISTINCT FROM '> 100% = burnout risk; < 60% = bench.'
    OR component_1_label IS DISTINCT FROM 'Worked hours'
    OR component_2_label IS DISTINCT FROM 'Available hours'
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'Early warning ahead of Utilization.',
  component_1_label = 'Planned hours',
  component_2_label = 'Available hours'
WHERE name = 'Busy Rate'
  AND (
    insight IS DISTINCT FROM 'Early warning ahead of Utilization.'
    OR component_1_label IS DISTINCT FROM 'Planned hours'
    OR component_2_label IS DISTINCT FROM 'Available hours'
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'Leading indicator of attrition and churn.',
  component_1_label = 'CSAT score (1–5)',
  component_2_label = NULL
WHERE name = 'eNPS / CSS'
  AND (
    insight IS DISTINCT FROM 'Leading indicator of attrition and churn.'
    OR component_1_label IS DISTINCT FROM 'CSAT score (1–5)'
    OR component_2_label IS DISTINCT FROM NULL
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'Drift = lower productivity or wrong rate-card. Enter the baseline as the denominator to compare against (instead of storing a multi-period trend).',
  component_1_label = 'Actual cost per SP',
  component_2_label = 'Baseline cost per SP'
WHERE name = 'Cost Per Story Point'
  AND (
    insight IS DISTINCT FROM 'Drift = lower productivity or wrong rate-card. Enter the baseline as the denominator to compare against (instead of storing a multi-period trend).'
    OR component_1_label IS DISTINCT FROM 'Actual cost per SP'
    OR component_2_label IS DISTINCT FROM 'Baseline cost per SP'
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'Track the trend rather than the absolute value.',
  component_1_label = 'Revenue per BMM (actual)',
  component_2_label = 'Baseline revenue per BMM'
WHERE name = 'Revenue Per BMM'
  AND (
    insight IS DISTINCT FROM 'Track the trend rather than the absolute value.'
    OR component_1_label IS DISTINCT FROM 'Revenue per BMM (actual)'
    OR component_2_label IS DISTINCT FROM 'Baseline revenue per BMM'
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'Red = knowledge loss + high onboarding cost.',
  component_1_label = 'Leavers (trailing 12mo)',
  component_2_label = 'Avg headcount (trailing 12mo)'
WHERE name = 'Attrition Rate (rolling 12m)'
  AND (
    insight IS DISTINCT FROM 'Red = knowledge loss + high onboarding cost.'
    OR component_1_label IS DISTINCT FROM 'Leavers (trailing 12mo)'
    OR component_2_label IS DISTINCT FROM 'Avg headcount (trailing 12mo)'
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'Red = wrong capacity forecast or weak pipeline.',
  component_1_label = 'Bench hours',
  component_2_label = 'Total available hours'
WHERE name = 'Bench Rate'
  AND (
    insight IS DISTINCT FROM 'Red = wrong capacity forecast or weak pipeline.'
    OR component_1_label IS DISTINCT FROM 'Bench hours'
    OR component_2_label IS DISTINCT FROM 'Total available hours'
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'Leading indicator of burnout & quality drop.',
  component_1_label = 'OT hours',
  component_2_label = 'Standard hours'
WHERE name = 'Overtime Ratio'
  AND (
    insight IS DISTINCT FROM 'Leading indicator of burnout & quality drop.'
    OR component_1_label IS DISTINCT FROM 'OT hours'
    OR component_2_label IS DISTINCT FROM 'Standard hours'
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'Red = poor knowledge management.',
  component_1_label = 'Days join → first productive delivery',
  component_2_label = NULL
WHERE name = 'Onboarding Ramp-up Time'
  AND (
    insight IS DISTINCT FROM 'Red = poor knowledge management.'
    OR component_1_label IS DISTINCT FROM 'Days join → first productive delivery'
    OR component_2_label IS DISTINCT FROM NULL
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'Commitment discipline — Red = delivery system failure.',
  component_1_label = 'On-time milestones',
  component_2_label = 'Total milestones'
WHERE name = 'On-time Delivery'
  AND (
    insight IS DISTINCT FROM 'Commitment discipline — Red = delivery system failure.'
    OR component_1_label IS DISTINCT FROM 'On-time milestones'
    OR component_2_label IS DISTINCT FROM 'Total milestones'
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'Red = rework, waste from requirements / skill / process.',
  component_1_label = 'Std hours output',
  component_2_label = 'Actual input hours'
WHERE name = 'Completed Effectiveness (CE)'
  AND (
    insight IS DISTINCT FROM 'Red = rework, waste from requirements / skill / process.'
    OR component_1_label IS DISTINCT FROM 'Std hours output'
    OR component_2_label IS DISTINCT FROM 'Actual input hours'
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'Roadmap reliability with the business.',
  component_1_label = 'Shipped scope',
  component_2_label = 'Planned scope'
WHERE name = 'Release Predictability'
  AND (
    insight IS DISTINCT FROM 'Roadmap reliability with the business.'
    OR component_1_label IS DISTINCT FROM 'Shipped scope'
    OR component_2_label IS DISTINCT FROM 'Planned scope'
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = '> 1.15 is also a warning — under-planning.',
  component_1_label = 'Earned value',
  component_2_label = 'Planned value'
WHERE name = 'Schedule Performance Index (SPI)'
  AND (
    insight IS DISTINCT FROM '> 1.15 is also a warning — under-planning.'
    OR component_1_label IS DISTINCT FROM 'Earned value'
    OR component_2_label IS DISTINCT FROM 'Planned value'
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'Red = planning chaos or unknown risks.',
  component_1_label = 'Forecast deviation |Forecast − Actual|',
  component_2_label = 'Total duration'
WHERE name = 'Forecast Accuracy'
  AND (
    insight IS DISTINCT FROM 'Red = planning chaos or unknown risks.'
    OR component_1_label IS DISTINCT FROM 'Forecast deviation |Forecast − Actual|'
    OR component_2_label IS DISTINCT FROM 'Total duration'
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'DORA #1 — Elite = on-demand. Approx: ≥1/day = Green, weekly–monthly = Yellow, <monthly = Red.',
  component_1_label = '# production deploys',
  component_2_label = 'Period (days)'
WHERE name = 'Deployment Frequency'
  AND (
    insight IS DISTINCT FROM 'DORA #1 — Elite = on-demand. Approx: ≥1/day = Green, weekly–monthly = Yellow, <monthly = Red.'
    OR component_1_label IS DISTINCT FROM '# production deploys'
    OR component_2_label IS DISTINCT FROM 'Period (days)'
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'DORA #2 — pipeline agility.',
  component_1_label = 'Commit → production (days)',
  component_2_label = NULL
WHERE name = 'Lead Time for Changes'
  AND (
    insight IS DISTINCT FROM 'DORA #2 — pipeline agility.'
    OR component_1_label IS DISTINCT FROM 'Commit → production (days)'
    OR component_2_label IS DISTINCT FROM NULL
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'DORA #3 — Red = regression, test gap, rushed deploy.',
  component_1_label = 'Failed deploys',
  component_2_label = 'Total deploys'
WHERE name = 'Change Failure Rate (CFR)'
  AND (
    insight IS DISTINCT FROM 'DORA #3 — Red = regression, test gap, rushed deploy.'
    OR component_1_label IS DISTINCT FROM 'Failed deploys'
    OR component_2_label IS DISTINCT FROM 'Total deploys'
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'DORA #4 — reliability indicator.',
  component_1_label = 'Detect → restore (hours)',
  component_2_label = NULL
WHERE name = 'MTTR — Production'
  AND (
    insight IS DISTINCT FROM 'DORA #4 — reliability indicator.'
    OR component_1_label IS DISTINCT FROM 'Detect → restore (hours)'
    OR component_2_label IS DISTINCT FROM NULL
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'Red = features become obsolete before release.',
  component_1_label = 'Idea → production (weeks)',
  component_2_label = NULL
WHERE name = 'Time-to-Market (Feature Cycle Time)'
  AND (
    insight IS DISTINCT FROM 'Red = features become obsolete before release.'
    OR component_1_label IS DISTINCT FROM 'Idea → production (weeks)'
    OR component_2_label IS DISTINCT FROM NULL
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'Red = UAT process broken.',
  component_1_label = 'UAT submit → sign-off (days)',
  component_2_label = NULL
WHERE name = 'Customer Acceptance Lead Time'
  AND (
    insight IS DISTINCT FROM 'Red = UAT process broken.'
    OR component_1_label IS DISTINCT FROM 'UAT submit → sign-off (days)'
    OR component_2_label IS DISTINCT FROM NULL
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'Red = process bypassed, reliance on individuals.',
  component_1_label = 'Pass items',
  component_2_label = 'Total checklist items'
WHERE name = 'PCV (Process Compliance)'
  AND (
    insight IS DISTINCT FROM 'Red = process bypassed, reliance on individuals.'
    OR component_1_label IS DISTINCT FROM 'Pass items'
    OR component_2_label IS DISTINCT FROM 'Total checklist items'
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'Applied = actually implemented, not just proposed.',
  component_1_label = '# initiatives applied this quarter',
  component_2_label = NULL
WHERE name = 'Innovation Index'
  AND (
    insight IS DISTINCT FROM 'Applied = actually implemented, not just proposed.'
    OR component_1_label IS DISTINCT FROM '# initiatives applied this quarter'
    OR component_2_label IS DISTINCT FROM NULL
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'Red = risk of certification failure.',
  component_1_label = 'Audit items pass',
  component_2_label = 'Total items'
WHERE name = 'Audit Compliance Rate'
  AND (
    insight IS DISTINCT FROM 'Red = risk of certification failure.'
    OR component_1_label IS DISTINCT FROM 'Audit items pass'
    OR component_2_label IS DISTINCT FROM 'Total items'
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'Red = retro is just a formality.',
  component_1_label = 'Actions closed on time',
  component_2_label = 'Actions raised'
WHERE name = 'Retrospective Action Closure Rate'
  AND (
    insight IS DISTINCT FROM 'Red = retro is just a formality.'
    OR component_1_label IS DISTINCT FROM 'Actions closed on time'
    OR component_2_label IS DISTINCT FROM 'Actions raised'
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'Red = risk accumulates → audit failure.',
  component_1_label = 'CAPA closed within SLA',
  component_2_label = 'Total raised'
WHERE name = 'CAPA Closure Rate'
  AND (
    insight IS DISTINCT FROM 'Red = risk accumulates → audit failure.'
    OR component_1_label IS DISTINCT FROM 'CAPA closed within SLA'
    OR component_2_label IS DISTINCT FROM 'Total raised'
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'Red = risk register is just a form.',
  component_1_label = 'Risks closed',
  component_2_label = 'Total risks'
WHERE name = 'Risk Closure Rate'
  AND (
    insight IS DISTINCT FROM 'Red = risk register is just a form.'
    OR component_1_label IS DISTINCT FROM 'Risks closed'
    OR component_2_label IS DISTINCT FROM 'Total risks'
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'Red = only recorded after it blows up.',
  component_1_label = 'Days occurrence → register entry (negative = detected early)',
  component_2_label = NULL
WHERE name = 'Risk Identification Lead Time'
  AND (
    insight IS DISTINCT FROM 'Red = only recorded after it blows up.'
    OR component_1_label IS DISTINCT FROM 'Days occurrence → register entry (negative = detected early)'
    OR component_2_label IS DISTINCT FROM NULL
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'Red = slow onboarding, knowledge silos.',
  component_1_label = 'Docs updated within 30 days',
  component_2_label = 'Total docs'
WHERE name = 'Documentation Currency Rate'
  AND (
    insight IS DISTINCT FROM 'Red = slow onboarding, knowledge silos.'
    OR component_1_label IS DISTINCT FROM 'Docs updated within 30 days'
    OR component_2_label IS DISTINCT FROM 'Total docs'
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'Red = legal & audit risk.',
  component_1_label = 'Completed mandatory training',
  component_2_label = 'Required training'
WHERE name = 'Training Compliance Rate'
  AND (
    insight IS DISTINCT FROM 'Red = legal & audit risk.'
    OR component_1_label IS DISTINCT FROM 'Completed mandatory training'
    OR component_2_label IS DISTINCT FROM 'Required training'
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  insight = 'Red = repeating the same old mistakes.',
  component_1_label = 'Lessons applied',
  component_2_label = 'Lessons archived'
WHERE name = 'Lessons Learned Adoption Rate'
  AND (
    insight IS DISTINCT FROM 'Red = repeating the same old mistakes.'
    OR component_1_label IS DISTINCT FROM 'Lessons applied'
    OR component_2_label IS DISTINCT FROM 'Lessons archived'
  );
--> statement-breakpoint
UPDATE pm.kpi_norm_metric SET
  formula_label = 'Survey score — CSAT scale 1–5',
  version = version + 1
WHERE name = 'eNPS / CSS'
  AND formula_label = 'Survey score — CSAT thang 1–5';

