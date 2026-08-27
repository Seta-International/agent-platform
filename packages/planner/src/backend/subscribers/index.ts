import type { SubscriberDef } from '@seta/shared-types';
import {
  applyDeactivated,
  applyEmailChanged,
  applyProfileUpdated,
  applyUserCreated,
} from './identity-projection.ts';
import {
  handleBucketCreated,
  handleBucketDeleted,
  handleGroupCreated,
  handleGroupDeleted,
  handleGroupMemberAdded,
  handleGroupMemberRoleChanged,
  handlePlanCreated,
  handlePlanDeleted,
  handleTaskAssigned,
  handleTaskCompleted,
  handleTaskCreated,
  handleTaskDeleted,
  handleTaskReopened,
  handleTaskUnassigned,
} from './notification-trigger.ts';
import {
  handleLabelChanged,
  handleTaskCreated as handleTaskCreatedForEmbedding,
  handleTaskDeleted as handleTaskDeletedForEmbedding,
  handleTaskUpdated as handleTaskUpdatedForEmbedding,
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
      handler: handleTaskCreatedForEmbedding as SubscriberDef['handler'],
    },
    {
      event: 'planner.task.updated',
      eventVersion: 1,
      subscription: 'planner.embeddings.refresh-task.updated',
      handler: handleTaskUpdatedForEmbedding as SubscriberDef['handler'],
    },
    {
      event: 'planner.task.deleted',
      eventVersion: 1,
      subscription: 'planner.embeddings.refresh-task.deleted',
      handler: handleTaskDeletedForEmbedding as SubscriberDef['handler'],
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
    {
      event: 'planner.task.created',
      eventVersion: 1,
      subscription: 'planner.notifications.trigger-task-created',
      handler: handleTaskCreated as SubscriberDef['handler'],
    },
    {
      event: 'planner.task.deleted',
      eventVersion: 1,
      subscription: 'planner.notifications.trigger-task-deleted',
      handler: handleTaskDeleted as SubscriberDef['handler'],
    },
    {
      event: 'planner.task.assigned',
      eventVersion: 1,
      subscription: 'planner.notifications.trigger-task-assigned',
      handler: handleTaskAssigned as SubscriberDef['handler'],
    },
    {
      event: 'planner.task.unassigned',
      eventVersion: 1,
      subscription: 'planner.notifications.trigger-task-unassigned',
      handler: handleTaskUnassigned as SubscriberDef['handler'],
    },
    {
      event: 'planner.task.completed',
      eventVersion: 1,
      subscription: 'planner.notifications.trigger-task-completed',
      handler: handleTaskCompleted as SubscriberDef['handler'],
    },
    {
      event: 'planner.task.reopened',
      eventVersion: 1,
      subscription: 'planner.notifications.trigger-task-reopened',
      handler: handleTaskReopened as SubscriberDef['handler'],
    },
    {
      event: 'planner.group.created',
      eventVersion: 1,
      subscription: 'planner.notifications.trigger-group-created',
      handler: handleGroupCreated as SubscriberDef['handler'],
    },
    {
      event: 'planner.group.deleted',
      eventVersion: 1,
      subscription: 'planner.notifications.trigger-group-deleted',
      handler: handleGroupDeleted as SubscriberDef['handler'],
    },
    {
      event: 'planner.group.member.added',
      eventVersion: 1,
      subscription: 'planner.notifications.trigger-group-member-added',
      handler: handleGroupMemberAdded as SubscriberDef['handler'],
    },
    {
      event: 'planner.group.member.role-changed',
      eventVersion: 1,
      subscription: 'planner.notifications.trigger-group-member-role-changed',
      handler: handleGroupMemberRoleChanged as SubscriberDef['handler'],
    },
    {
      event: 'planner.plan.created',
      eventVersion: 1,
      subscription: 'planner.notifications.trigger-plan-created',
      handler: handlePlanCreated as SubscriberDef['handler'],
    },
    {
      event: 'planner.plan.deleted',
      eventVersion: 1,
      subscription: 'planner.notifications.trigger-plan-deleted',
      handler: handlePlanDeleted as SubscriberDef['handler'],
    },
    {
      event: 'planner.bucket.created',
      eventVersion: 1,
      subscription: 'planner.notifications.trigger-bucket-created',
      handler: handleBucketCreated as SubscriberDef['handler'],
    },
    {
      event: 'planner.bucket.deleted',
      eventVersion: 1,
      subscription: 'planner.notifications.trigger-bucket-deleted',
      handler: handleBucketDeleted as SubscriberDef['handler'],
    },
  ];
}
