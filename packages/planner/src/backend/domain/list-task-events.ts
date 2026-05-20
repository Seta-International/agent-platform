// -- cross-schema-read: list-task-events.ts reads core.events for the activity feed (architecture §F.4.1).
import type { SessionScope } from '@seta/core';
import { eq, sql } from 'drizzle-orm';
import { plannerDb } from '../../db/index.ts';
import { plans, tasks } from '../../db/schema.ts';
import type { PlannerEvent } from '../../events/types.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { groupFilterFor } from '../read-helpers.ts';

export type PersistedPlannerEvent = PlannerEvent & {
  id: string;
  tenant_id: string;
  trace_id: string | null;
  caused_by_event_id: string | null;
  occurred_at: Date;
};

export interface ListTaskEventsOpts {
  task_id: string;
  session: SessionScope;
  limit?: number;
  cursor?: string;
}

export interface ListTaskEventsResult {
  events: PersistedPlannerEvent[];
  next_cursor?: string;
}

interface CursorTuple {
  o: string;
  i: string;
}

function encodeCursor(t: CursorTuple): string {
  return Buffer.from(JSON.stringify(t), 'utf8').toString('base64');
}

function decodeCursor(s: string): CursorTuple {
  try {
    return JSON.parse(Buffer.from(s, 'base64').toString('utf8')) as CursorTuple;
  } catch {
    throw new PlannerError('VALIDATION', 'Invalid cursor', { cursor: s });
  }
}

export async function listTaskEvents(opts: ListTaskEventsOpts): Promise<ListTaskEventsResult> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const db = plannerDb();

  const [task] = await db.select().from(tasks).where(eq(tasks.id, opts.task_id)).limit(1);
  if (!task || task.tenant_id !== opts.session.tenant_id) {
    throw new PlannerError('NOT_FOUND', 'Task not found', { task_id: opts.task_id });
  }
  const [plan] = await db.select().from(plans).where(eq(plans.id, task.plan_id)).limit(1);
  if (!plan) {
    throw new PlannerError('NOT_FOUND', 'Parent plan not found', { plan_id: task.plan_id });
  }

  requirePermission(opts.session, 'planner.task.read', plan.group_id);

  const groupFilter = groupFilterFor(opts.session);
  if (groupFilter !== null && !groupFilter.includes(plan.group_id)) {
    throw new PlannerError('FORBIDDEN', 'No access to group', {
      task_id: opts.task_id,
      group_id: plan.group_id,
    });
  }

  const cursorClause = opts.cursor
    ? (() => {
        const c = decodeCursor(opts.cursor);
        return sql`AND (occurred_at, id) < (${c.o}::timestamptz, ${c.i}::uuid)`;
      })()
    : sql``;

  const result = await db.execute(sql`
    SELECT id, occurred_at, tenant_id, aggregate_type, aggregate_id,
           event_type, event_version, payload, trace_id, caused_by_event_id
    FROM core.events
    WHERE tenant_id = ${opts.session.tenant_id}::uuid
      AND (
        (aggregate_type = 'planner.task' AND aggregate_id = ${opts.task_id})
        OR (aggregate_type IN ('planner.checklist_item', 'planner.label')
            AND payload->>'task_id' = ${opts.task_id})
      )
      ${cursorClause}
    ORDER BY occurred_at DESC, id DESC
    LIMIT ${limit + 1}
  `);

  const rows = result.rows as Record<string, unknown>[];
  const events = rows.slice(0, limit).map(rowToEvent);

  let next_cursor: string | undefined;
  if (rows.length > limit) {
    const last = events[events.length - 1];
    if (last) {
      next_cursor = encodeCursor({ o: last.occurred_at.toISOString(), i: last.id });
    }
  }

  return { events, next_cursor };
}

function rowToEvent(row: Record<string, unknown>): PersistedPlannerEvent {
  const occurredAt =
    row.occurred_at instanceof Date ? row.occurred_at : new Date(row.occurred_at as string);
  return {
    id: row.id as string,
    event_type: row.event_type as PlannerEvent['event_type'],
    event_version: row.event_version as PlannerEvent['event_version'],
    aggregate_type: row.aggregate_type as PlannerEvent['aggregate_type'],
    aggregate_id: row.aggregate_id as string,
    tenant_id: row.tenant_id as string,
    trace_id: (row.trace_id as string | null) ?? null,
    caused_by_event_id: (row.caused_by_event_id as string | null) ?? null,
    occurred_at: occurredAt,
    payload: row.payload as PlannerEvent['payload'],
  } as PersistedPlannerEvent;
}
