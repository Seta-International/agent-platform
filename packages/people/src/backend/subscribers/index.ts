import type { SubscriberDef } from '@seta/shared-types';
import {
  allocationProjectionCreated,
  allocationProjectionRemoved,
} from './allocation-projection.ts';
import { bindUserToPerson } from './bind-user-to-person.ts';

export function peopleSubscribers(): SubscriberDef[] {
  return [bindUserToPerson, allocationProjectionCreated, allocationProjectionRemoved];
}
