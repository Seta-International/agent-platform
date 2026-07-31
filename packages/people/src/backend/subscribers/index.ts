import type { SubscriberDef } from '@seta/shared-types';
import {
  refreshPersonSkillAddedSubscriber,
  refreshPersonSkillRemovedSubscriber,
} from '../embeddings/subscribers/refresh-profile.ts';
import { accountProjectionCreated, accountProjectionUpdated } from './account-projection.ts';
import {
  allocationProjectionCreated,
  allocationProjectionRemoved,
  allocationProjectionUpdated,
} from './allocation-projection.ts';
import { linkUserToPerson } from './link-user-to-person.ts';
import { projectProjectionCreated, projectProjectionUpdated } from './project-projection.ts';
import { personSkillRenamed } from './skill-renamed.ts';
import { userDeactivatedSynced, userReactivatedSynced } from './sync-user-status.ts';

export function peopleSubscribers(): SubscriberDef[] {
  return [
    linkUserToPerson,
    allocationProjectionCreated,
    allocationProjectionUpdated,
    allocationProjectionRemoved,
    accountProjectionCreated,
    accountProjectionUpdated,
    projectProjectionCreated,
    projectProjectionUpdated,
    refreshPersonSkillAddedSubscriber,
    refreshPersonSkillRemovedSubscriber,
    personSkillRenamed,
    userDeactivatedSynced,
    userReactivatedSynced,
  ];
}
