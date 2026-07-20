import type { DomainEvent, SubscriberDef } from '@seta/shared-types';
import { PM_PROJECT_CREATED } from '../../events.ts';
import { seedProjectCoreMetrics } from '../domain/kpi-norm.ts';

interface PmProjectCreated {
  project_id: string;
  tenant_id: string;
}

/** Configure metrics is per-project (functional-analysis.md §2d): every new project starts with
 * Core metrics applied, mirroring what tenant-wide seeding used to do in `ensureKpiNormSeeded`. */
export const kpiCoreMetricsSeedOnProjectCreated: SubscriberDef = {
  subscription: 'pm.kpi-core-metrics-seed.project-created',
  event: PM_PROJECT_CREATED,
  eventVersion: 1,
  handler: async (event, ctx) => {
    const { project_id, tenant_id } = (event as DomainEvent<PmProjectCreated>).payload;
    await seedProjectCoreMetrics(ctx.tx, tenant_id, project_id);
  },
};
