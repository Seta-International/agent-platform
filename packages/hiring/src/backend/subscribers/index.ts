import type { SubscriberDef } from '@seta/shared-types';
import { accountProjectionCreated, accountProjectionUpdated } from './account-projection.ts';
import { projectProjectionCreated, projectProjectionUpdated } from './project-projection.ts';
import { hiringSkillRenamed } from './skill-renamed.ts';

export function hiringSubscribers(): SubscriberDef[] {
  return [
    hiringSkillRenamed,
    accountProjectionCreated,
    accountProjectionUpdated,
    projectProjectionCreated,
    projectProjectionUpdated,
  ];
}
