import type { QueryClient } from '@tanstack/react-query';
import { plannerKeys } from './query-keys';
import { isOwnEcho } from './recent-mutation-event-ids';

export interface StreamEvent {
  id: string;
  eventType: string;
  eventVersion: number;
  aggregateType: string;
  aggregateId: string;
  tenantId: string;
  occurredAt: string | Date;
  payload: Record<string, unknown>;
}

function payloadField(p: Record<string, unknown>, field: string): string | undefined {
  const v = p[field];
  return typeof v === 'string' ? v : undefined;
}

export function applyPlannerEvent(qc: QueryClient, event: StreamEvent): void {
  if (isOwnEcho(event.id)) return;

  const p = event.payload;
  const groupId = payloadField(p, 'group_id');
  const planId = payloadField(p, 'plan_id');
  const taskId = payloadField(p, 'task_id');

  switch (event.eventType) {
    case 'planner.group.created':
    case 'planner.group.deleted':
    case 'planner.group.restored':
      qc.invalidateQueries({ queryKey: plannerKeys.groups() });
      return;
    case 'planner.group.updated':
      if (groupId) qc.invalidateQueries({ queryKey: plannerKeys.group(groupId) });
      qc.invalidateQueries({ queryKey: plannerKeys.groups() });
      return;
    case 'planner.group.member.added':
    case 'planner.group.member.removed':
      if (groupId) qc.invalidateQueries({ queryKey: plannerKeys.groupMembers(groupId) });
      qc.invalidateQueries({ queryKey: plannerKeys.myGroups() });
      return;

    case 'planner.plan.created':
    case 'planner.plan.updated':
    case 'planner.plan.deleted':
    case 'planner.plan.restored':
      if (groupId) qc.invalidateQueries({ queryKey: plannerKeys.groupPlans(groupId) });
      if (planId) qc.invalidateQueries({ queryKey: plannerKeys.plan(planId) });
      return;

    case 'planner.bucket.created':
    case 'planner.bucket.updated':
    case 'planner.bucket.deleted':
      if (planId) qc.invalidateQueries({ queryKey: plannerKeys.plan(planId) });
      return;

    case 'planner.task.created':
    case 'planner.task.updated':
    case 'planner.task.moved':
    case 'planner.task.assigned':
    case 'planner.task.unassigned':
    case 'planner.task.completed':
    case 'planner.task.reopened':
    case 'planner.task.deleted':
    case 'planner.task.restored':
      if (planId) qc.invalidateQueries({ queryKey: plannerKeys.plan(planId) });
      if (taskId) qc.invalidateQueries({ queryKey: plannerKeys.task(taskId) });
      return;

    case 'planner.checklist_item.added':
    case 'planner.checklist_item.updated':
    case 'planner.checklist_item.removed':
      if (taskId) {
        qc.invalidateQueries({ queryKey: plannerKeys.taskChecklist(taskId) });
        qc.invalidateQueries({ queryKey: plannerKeys.taskEvents(taskId) });
      }
      return;

    case 'planner.label.created':
    case 'planner.label.updated':
    case 'planner.label.deleted':
      if (planId) qc.invalidateQueries({ queryKey: plannerKeys.planLabels(planId) });
      return;

    case 'planner.label.applied':
    case 'planner.label.unapplied':
      if (taskId) qc.invalidateQueries({ queryKey: plannerKeys.task(taskId) });
      if (planId) qc.invalidateQueries({ queryKey: plannerKeys.plan(planId) });
      return;
  }
}
