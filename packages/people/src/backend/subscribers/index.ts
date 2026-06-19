import type { SubscriberDef } from '@seta/shared-types';
import { bindUserToPerson } from './bind-user-to-person.ts';

export function peopleSubscribers(): SubscriberDef[] {
  return [bindUserToPerson];
}
