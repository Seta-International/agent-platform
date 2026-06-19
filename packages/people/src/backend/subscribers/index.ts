import type { SubscriberDef } from '@seta/shared-types';

// Inbound-event framework. Concrete handlers (first: identity.user.created →
// person link, PPL-2) are added here as later slices land.
export function peopleSubscribers(): SubscriberDef[] {
  return [];
}
