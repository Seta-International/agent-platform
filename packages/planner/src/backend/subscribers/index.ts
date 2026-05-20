import type { SubscriberDef } from '@seta/shared-types';
import {
  applyDeactivated,
  applyEmailChanged,
  applyProfileUpdated,
  applyUserCreated,
} from './identity-projection.ts';

export function plannerSubscribers(): SubscriberDef[] {
  return [
    {
      event: 'identity.user.created',
      eventVersion: 1,
      subscription: 'planner.assignee-projection.create',
      handler: applyUserCreated as SubscriberDef['handler'],
    },
    {
      event: 'identity.user.profile.updated',
      eventVersion: 1,
      subscription: 'planner.assignee-projection.update',
      handler: applyProfileUpdated as SubscriberDef['handler'],
    },
    {
      event: 'identity.user.deactivated',
      eventVersion: 1,
      subscription: 'planner.assignee-projection.deactivate',
      handler: applyDeactivated as SubscriberDef['handler'],
    },
    {
      event: 'identity.user.email.changed',
      eventVersion: 1,
      subscription: 'planner.assignee-projection.email',
      handler: applyEmailChanged as SubscriberDef['handler'],
    },
  ];
}
