// -- cross-schema-read: get-user-activity.ts reads core.events for a user's activity feed.
import type { SessionScope } from '@seta/core';
import { sql } from 'drizzle-orm';
import { plannerDb } from '../db/index.ts';
import { groupFilterFor } from '../read-helpers.ts';

export interface GetUserActivityOpts {
  user_id: string;
  session: SessionScope;
  since?: string;
  limit?: number;
}

export interface UserActivityEvent {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  occurredAt: string;
}

export interface GetUserActivityResult {
  events: UserActivityEvent[];
}

export async function getUserActivity(opts: GetUserActivityOpts): Promise<GetUserActivityResult> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const groupIds = await groupFilterFor(opts.session);

  const db = plannerDb();

  const groupClause =
    groupIds === null
      ? sql``
      : groupIds.length === 0
        ? sql`AND FALSE`
        : sql`AND EXISTS (
            SELECT 1 FROM planner.tasks t
            JOIN planner.plans p ON p.id = t.plan_id
            WHERE t.id = ev.aggregate_id::uuid
              AND p.group_id = ANY(ARRAY[${sql.join(
                groupIds.map((id) => sql`${id}::uuid`),
                sql`,`,
              )}])
          )`;

  const sinceClause = opts.since ? sql`AND ev.occurred_at >= ${opts.since}::timestamptz` : sql``;

  const result = await db.execute(sql`
    SELECT ev.id, ev.event_type, ev.aggregate_type, ev.aggregate_id, ev.occurred_at
    FROM core.events ev
    WHERE ev.tenant_id = ${opts.session.tenant_id}::uuid
      AND ev.aggregate_type LIKE 'planner.%'
      AND ev.actor->>'user_id' = ${opts.user_id}
      ${sinceClause}
      ${groupClause}
    ORDER BY ev.occurred_at DESC, ev.id DESC
    LIMIT ${limit}
  `);

  const events = (result.rows as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    eventType: r.event_type as string,
    aggregateType: r.aggregate_type as string,
    aggregateId: r.aggregate_id as string,
    occurredAt: (r.occurred_at instanceof Date
      ? r.occurred_at
      : new Date(r.occurred_at as string)
    ).toISOString(),
  }));

  return { events };
}
