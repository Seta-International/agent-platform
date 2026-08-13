import {
  actorFromContext,
  defineAgentTool,
  resolveTaskRef,
  TASK_REF_DESCRIPTION,
} from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { z } from 'zod';
import type { PersistedPlannerEvent } from '../domain/list-task-events.ts';
import { listTaskEvents } from '../domain/list-task-events.ts';

function extractDetails(e: PersistedPlannerEvent): Record<string, unknown> | null {
  const p = e.payload as Record<string, unknown>;
  const actor = p.actor as { display_name?: string; user_id?: string } | undefined;
  const by = actor?.display_name ?? actor?.user_id ?? undefined;

  switch (e.event_type) {
    case 'planner.task.created':
      return { action: 'created', title: (p.after as Record<string, unknown>)?.title, by };
    case 'planner.task.updated':
      return {
        action: 'updated',
        changedFields: p.changed_fields,
        before: p.before,
        after: p.after,
        by,
      };
    case 'planner.task.deleted':
      return { action: 'deleted', by };
    case 'planner.task.restored':
      return { action: 'restored', by };
    case 'planner.task.moved':
      return {
        action: 'moved',
        fromPlanId: p.from_plan_id,
        toPlanId: p.to_plan_id,
        before: p.before,
        after: p.after,
        by,
      };
    case 'planner.task.assigned':
      return { action: 'assigned', userId: p.user_id, by };
    case 'planner.task.unassigned':
      return { action: 'unassigned', userId: p.user_id, by };
    case 'planner.task.completed':
      return { action: 'completed', completedAt: p.completed_at, by };
    case 'planner.task.reopened':
      return { action: 'reopened', by };
    case 'planner.task.reference-added':
      return { action: 'reference_added', url: p.url, alias: p.alias, by };
    case 'planner.task.reference-removed':
      return { action: 'reference_removed', url: p.url, by };
    case 'planner.checklist_item.added':
      return { action: 'checklist_added', label: p.label, by };
    case 'planner.checklist_item.updated':
      return { action: 'checklist_updated', before: p.before, after: p.after, by };
    case 'planner.checklist_item.removed':
      return { action: 'checklist_removed', by };
    case 'planner.label.applied':
      return { action: 'label_applied', labelId: p.label_id, by };
    case 'planner.label.unapplied':
      return { action: 'label_removed', labelId: p.label_id, by };
    case 'planner.comment.created':
      return { action: 'comment_added', body: p.body, authorId: p.author_id, by };
    case 'planner.comment.updated':
      return { action: 'comment_edited', before: p.before, after: p.after, by };
    case 'planner.comment.deleted':
      return { action: 'comment_deleted', by };
    default:
      return by ? { by } : null;
  }
}

export const plannerGetItemActivityTool = defineAgentTool({
  id: 'planner_getItemActivity',
  name: 'Get Item Activity',
  description:
    'Get the change history (activity feed) for one task, newest first — ' +
    'status changes, field updates (title, description, due date, priority, etc.), ' +
    'comments, label and checklist edits. Each event includes details of ' +
    'what changed (changedFields, before/after values, who made the change).',
  input: z.object({
    taskRef: z.string().trim().min(1).describe(TASK_REF_DESCRIPTION),
    limit: z.number().int().min(1).max(200).optional().describe('Max events (default 50).'),
    cursor: z.string().optional().describe('Opaque pagination cursor from a prior call.'),
  }),
  output: z.object({
    events: z.array(
      z.object({
        id: z.string(),
        eventType: z.string(),
        aggregateType: z.string(),
        occurredAt: z.string(),
        details: z.record(z.string(), z.unknown()).nullable(),
      }),
    ),
    nextCursor: z.string().nullable(),
  }),
  rbac: 'planner.task.read',
  execute: async (input, ctx) => {
    const actor = actorFromContext(ctx);
    const session = await buildActorSession(actor);
    const { taskId } = await resolveTaskRef(ctx as never, input.taskRef);

    const { events, next_cursor } = await listTaskEvents({
      task_id: taskId,
      session,
      limit: input.limit,
      cursor: input.cursor,
    });

    return {
      events: events.map((e) => ({
        id: e.id,
        eventType: e.event_type,
        aggregateType: e.aggregate_type,
        occurredAt: e.occurred_at.toISOString(),
        details: extractDetails(e),
      })),
      nextCursor: next_cursor ?? null,
    };
  },
});
