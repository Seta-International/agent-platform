import type { SessionScope } from '@seta/core';
import type { NodeTx } from '@seta/shared-db';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq } from 'drizzle-orm';
import { pmDb } from '../db/client.ts';
import { kpiAppliedMetric, kpiNorm, kpiNormMetric } from '../db/schema.ts';
import { requirePermission } from '../rbac.ts';
import type { BandCondition } from './kpi-norm-data.ts';
import { KPI_NORM_METRICS } from './kpi-norm-data.ts';

export const KPI_NORM_CODE = 'SETA-08-SOP-001';
export const KPI_NORM_REVISION = 'v2.0';
export const KPI_NORM_EFFECTIVE_DATE = '2026-05-19';

/** Sentinel actor for system-seeded rows with no real user behind them (established convention,
 * see e.g. packages/integrations/src/backend/m365/system-session.ts). */
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Idempotent: creates the tenant's KPI Norm doc + all 44 metric rows if missing, no-ops
 * otherwise (`onConflictDoNothing`). Called by the `core.tenant.created` subscriber for new
 * tenants; run once manually for any tenant that existed before this feature shipped.
 */
export async function ensureKpiNormSeeded(tx: NodeTx, tenant_id: string): Promise<void> {
  await tx
    .insert(kpiNorm)
    .values({
      tenant_id,
      code: KPI_NORM_CODE,
      revision: KPI_NORM_REVISION,
      effective_date: KPI_NORM_EFFECTIVE_DATE,
    })
    .onConflictDoNothing({ target: [kpiNorm.tenant_id, kpiNorm.code] });

  const [norm] = await tx
    .select({ id: kpiNorm.id })
    .from(kpiNorm)
    .where(and(eq(kpiNorm.tenant_id, tenant_id), eq(kpiNorm.code, KPI_NORM_CODE)))
    .limit(1);
  if (!norm) throw new Error(`kpi_norm seed failed to resolve norm id for tenant ${tenant_id}`);

  await tx
    .insert(kpiNormMetric)
    .values(
      KPI_NORM_METRICS.map((m) => ({
        tenant_id,
        norm_id: norm.id,
        category: m.category,
        tier: m.tier,
        name: m.name,
        formula_label: m.formula_label,
        component_count: m.component_count,
        component_1_label: m.component_1_label,
        component_2_label: m.component_2_label,
        component_1_integer: m.component_1_integer,
        component_2_integer: m.component_2_integer,
        component_1_min: m.component_1_min === null ? null : String(m.component_1_min),
        component_1_max: m.component_1_max === null ? null : String(m.component_1_max),
        is_share: m.is_share,
        green_band: m.green_band,
        yellow_band: m.yellow_band,
        red_band: m.red_band,
        insight: m.insight,
        is_live_capable: m.is_live_capable,
        sort_order: m.sort_order,
      })),
    )
    .onConflictDoNothing({
      target: [kpiNormMetric.tenant_id, kpiNormMetric.norm_id, kpiNormMetric.name],
    });
}

/**
 */
export async function seedProjectCoreMetrics(
  tx: NodeTx,
  tenant_id: string,
  project_id: string,
): Promise<void> {
  const [norm] = await tx
    .select({ id: kpiNorm.id })
    .from(kpiNorm)
    .where(and(eq(kpiNorm.tenant_id, tenant_id), eq(kpiNorm.code, KPI_NORM_CODE)))
    .limit(1);
  if (!norm) return;

  const coreRows = await tx
    .select({ id: kpiNormMetric.id })
    .from(kpiNormMetric)
    .where(
      and(
        eq(kpiNormMetric.tenant_id, tenant_id),
        eq(kpiNormMetric.norm_id, norm.id),
        eq(kpiNormMetric.tier, 'core'),
      ),
    );
  if (coreRows.length === 0) return;

  await tx
    .insert(kpiAppliedMetric)
    .values(
      coreRows.map((m) => ({
        tenant_id,
        project_id,
        metric_id: m.id,
        applied_by: SYSTEM_USER_ID,
      })),
    )
    .onConflictDoNothing({
      target: [kpiAppliedMetric.tenant_id, kpiAppliedMetric.project_id, kpiAppliedMetric.metric_id],
    });
}

export interface KpiNormMetricRow {
  metric_id: string;
  category: 'quality' | 'cost_capacity' | 'delivery' | 'process';
  tier: 'core' | 'extended';
  name: string;
  formula_label: string;
  component_count: 1 | 2;
  component_1_label: string;
  component_2_label: string | null;
  component_1_integer: boolean;
  component_2_integer: boolean;
  component_1_min: number | null;
  component_1_max: number | null;
  is_share: boolean;
  green_band: BandCondition;
  yellow_band: BandCondition;
  red_band: BandCondition;
  insight: string | null;
  is_live_capable: boolean;
}

export interface KpiNormDoc {
  norm_id: string;
  code: string;
  revision: string;
  effective_date: string | null;
  metrics: KpiNormMetricRow[];
}

export async function getKpiNorm(session: SessionScope): Promise<KpiNormDoc | null> {
  requirePermission(session, 'pm.project.read');

  const [norm] = await pmDb()
    .select({
      id: kpiNorm.id,
      code: kpiNorm.code,
      revision: kpiNorm.revision,
      effective_date: kpiNorm.effective_date,
    })
    .from(kpiNorm)
    .where(and(tenantScoped(kpiNorm.tenant_id, session), eq(kpiNorm.code, KPI_NORM_CODE)))
    .limit(1);
  if (!norm) return null;

  const metricRows = await pmDb()
    .select({
      metric_id: kpiNormMetric.id,
      category: kpiNormMetric.category,
      tier: kpiNormMetric.tier,
      name: kpiNormMetric.name,
      formula_label: kpiNormMetric.formula_label,
      component_count: kpiNormMetric.component_count,
      component_1_label: kpiNormMetric.component_1_label,
      component_2_label: kpiNormMetric.component_2_label,
      component_1_integer: kpiNormMetric.component_1_integer,
      component_2_integer: kpiNormMetric.component_2_integer,
      component_1_min: kpiNormMetric.component_1_min,
      component_1_max: kpiNormMetric.component_1_max,
      is_share: kpiNormMetric.is_share,
      green_band: kpiNormMetric.green_band,
      yellow_band: kpiNormMetric.yellow_band,
      red_band: kpiNormMetric.red_band,
      insight: kpiNormMetric.insight,
      is_live_capable: kpiNormMetric.is_live_capable,
    })
    .from(kpiNormMetric)
    .where(and(tenantScoped(kpiNormMetric.tenant_id, session), eq(kpiNormMetric.norm_id, norm.id)))
    .orderBy(kpiNormMetric.sort_order);

  return {
    norm_id: norm.id,
    code: norm.code,
    revision: norm.revision,
    effective_date: norm.effective_date,
    metrics: metricRows.map((r) => ({
      metric_id: r.metric_id,
      category: r.category as KpiNormMetricRow['category'],
      tier: r.tier as KpiNormMetricRow['tier'],
      name: r.name,
      formula_label: r.formula_label,
      component_count: r.component_count as 1 | 2,
      component_1_label: r.component_1_label,
      component_2_label: r.component_2_label,
      component_1_integer: r.component_1_integer,
      component_2_integer: r.component_2_integer,
      component_1_min: r.component_1_min === null ? null : Number(r.component_1_min),
      component_1_max: r.component_1_max === null ? null : Number(r.component_1_max),
      is_share: r.is_share,
      green_band: r.green_band as BandCondition,
      yellow_band: r.yellow_band as BandCondition,
      red_band: r.red_band as BandCondition,
      insight: r.insight,
      is_live_capable: r.is_live_capable,
    })),
  };
}
