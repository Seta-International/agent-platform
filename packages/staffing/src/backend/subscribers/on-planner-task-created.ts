import type { Mastra } from '@mastra/core';
import { RequestContext } from '@mastra/core/request-context';
import type { PlannerTaskCreated } from '@seta/planner/events';
import type { DomainEvent, SubscriberCtx, SubscriberDef } from '@seta/shared-types';
import { sql } from 'drizzle-orm';
import { NEW_TASK_SKILL_TAG_WORKFLOW_ID } from '../workflows/new-task-skill-tag/index.ts';

export const ON_PLANNER_TASK_CREATED_SUBSCRIPTION = 'staffing.new-task-skill-tag.start';

export interface OnPlannerTaskCreatedDeps {
  mastra: Mastra;
}

export async function onPlannerTaskCreated(
  deps: OnPlannerTaskCreatedDeps,
  event: DomainEvent<PlannerTaskCreated['payload']>,
  ctx: SubscriberCtx,
): Promise<void> {
  const existing: unknown = await ctx.tx.execute(
    sql`SELECT 1 FROM copilot.workflow_runs WHERE source_event_id = ${event.id} LIMIT 1`,
  );
  const rows =
    (existing as { rows?: unknown[] }).rows ??
    (Array.isArray(existing) ? (existing as unknown[]) : []);
  if (rows.length > 0) return;

  const wf = deps.mastra.getWorkflow(NEW_TASK_SKILL_TAG_WORKFLOW_ID);
  const run = await wf.createRun();

  const requestContext = new RequestContext();
  requestContext.set('actor', {
    type: 'user',
    user_id: event.payload.after.created_by,
  });
  requestContext.set('tenantId', event.tenantId);
  requestContext.set('startedBy', event.payload.after.created_by);
  requestContext.set('startedVia', 'event');
  requestContext.set('sourceEventId', event.id);

  await run.startAsync({
    inputData: {
      taskRef: {
        taskId: event.payload.after.task_id,
        tenantId: event.tenantId,
        groupId: event.payload.after.group_id,
      },
      initiatedBy: {
        userId: event.payload.after.created_by,
        via: 'event',
        sourceEventId: event.id,
      },
    },
    requestContext,
  });
}

export function makeOnPlannerTaskCreatedSubscriber(deps: OnPlannerTaskCreatedDeps): SubscriberDef {
  return {
    subscription: ON_PLANNER_TASK_CREATED_SUBSCRIPTION,
    event: 'planner.task.created',
    eventVersion: 1,
    handler: async (event, ctx) => {
      await onPlannerTaskCreated(deps, event as DomainEvent<PlannerTaskCreated['payload']>, ctx);
    },
  };
}
