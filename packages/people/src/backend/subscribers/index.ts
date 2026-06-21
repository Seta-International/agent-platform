import type { SubscriberDef } from '@seta/shared-types';
import { accountProjectionCreated, accountProjectionUpdated } from './account-projection.ts';
import {
  allocationProjectionCreated,
  allocationProjectionRemoved,
} from './allocation-projection.ts';
import { bindUserToPerson } from './bind-user-to-person.ts';
import { projectProjectionCreated, projectProjectionUpdated } from './project-projection.ts';

export function peopleSubscribers(): SubscriberDef[] {
  return [
    bindUserToPerson,
    allocationProjectionCreated,
    allocationProjectionRemoved,
    accountProjectionCreated,
    accountProjectionUpdated,
    projectProjectionCreated,
    projectProjectionUpdated,
  ];
}
