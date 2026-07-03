import type { SubscriberDef } from '@seta/shared-types';
import { staffingPlanLineSkillRenamed } from './skill-renamed.ts';
import { workerProjectionCreated, workerProjectionUpdated } from './worker-projection.ts';

export function pmSubscribers(): SubscriberDef[] {
  return [workerProjectionCreated, workerProjectionUpdated, staffingPlanLineSkillRenamed];
}
