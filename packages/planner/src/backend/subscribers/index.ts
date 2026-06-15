import type { SubscriberDef } from '@seta/shared-types';
import {
  applyDeactivated,
  applyEmailChanged,
  applyProfileUpdated,
  applyUserCreated,
} from './identity-projection.ts';
import {
  handleLabelChanged,
  handleTaskCreated,
  handleTaskDeleted,
  handleTaskUpdated,
} from './task-embedding.ts';

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
    {
      event: 'planner.task.created',
      eventVersion: 1,
      subscription: 'planner.embeddings.refresh-task.created',
      handler: handleTaskCreated as SubscriberDef['handler'],
    },
    {
      event: 'planner.task.updated',
      eventVersion: 1,
      subscription: 'planner.embeddings.refresh-task.updated',
      handler: handleTaskUpdated as SubscriberDef['handler'],
    },
    {
      event: 'planner.task.deleted',
      eventVersion: 1,
      subscription: 'planner.embeddings.refresh-task.deleted',
      handler: handleTaskDeleted as SubscriberDef['handler'],
    },
    {
      event: 'planner.label.applied',
      eventVersion: 1,
      subscription: 'planner.embeddings.refresh-task.label-applied',
      handler: handleLabelChanged as SubscriberDef['handler'],
    },
    {
      event: 'planner.label.unapplied',
      eventVersion: 1,
      subscription: 'planner.embeddings.refresh-task.label-unapplied',
      handler: handleLabelChanged as SubscriberDef['handler'],
    },
  ];
}
