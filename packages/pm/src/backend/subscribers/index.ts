import type { SubscriberDef } from '@seta/shared-types';
import { kpiCoreMetricsSeedOnProjectCreated } from './kpi-core-metrics-project-created.ts';
import { kpiNormSeedOnTenantCreated } from './kpi-norm-seed.ts';
import { reporterAssignmentOnAccessChanged } from './reporter-assignment.ts';
import { staffingPlanLineSkillRenamed } from './skill-renamed.ts';
import {
  workerProjectionCreated,
  workerProjectionReinstated,
  workerProjectionTerminated,
  workerProjectionUpdated,
} from './worker-projection.ts';

export function pmSubscribers(): SubscriberDef[] {
  return [
    workerProjectionCreated,
    workerProjectionUpdated,
    workerProjectionTerminated,
    workerProjectionReinstated,
    staffingPlanLineSkillRenamed,
    kpiNormSeedOnTenantCreated,
    kpiCoreMetricsSeedOnProjectCreated,
    reporterAssignmentOnAccessChanged,
  ];
}
