import type { DomainEvent, SubscriberDef } from '@seta/shared-types';
import { sql } from 'drizzle-orm';
import { PEOPLE_WORKER_UPDATED, type WorkerUpdatedPayload } from '../../events.ts';

/**
 * When a worker's org_unit_id changes, recompute head_worker_id for every unit in the tenant
 * (most-senior/earliest-hired member) and cascade to each worker's manager_id.
 * Runs inside the same transaction as the editWorker write — idempotent, safe to replay.
 */
export const orgUnitHeadBackfill: SubscriberDef = {
  subscription: 'people.org-unit-head-backfill',
  event: PEOPLE_WORKER_UPDATED,
  eventVersion: 1,
  handler: async (event, ctx) => {
    const { tenant_id, fields } = (event as DomainEvent<WorkerUpdatedPayload>).payload;
    if (!fields.includes('org_unit_id')) return;

    await ctx.tx.execute(sql`
      UPDATE people.org_unit ou
      SET head_worker_id = (
        SELECT w.person_id
        FROM people.worker w
        JOIN people.person p ON p.id = w.person_id
        WHERE w.org_unit_id = ou.id
          AND w.tenant_id = ou.tenant_id
          AND w.deleted_at IS NULL
        ORDER BY p.original_hire_date NULLS LAST, w.full_name
        LIMIT 1
      )
      WHERE ou.tenant_id = ${tenant_id}
    `);

    await ctx.tx.execute(sql`
      UPDATE people.worker w
      SET manager_id = (
        SELECT CASE
          WHEN ou.head_worker_id = w.person_id THEN parent_ou.head_worker_id
          ELSE ou.head_worker_id
        END
        FROM people.org_unit ou
        LEFT JOIN people.org_unit parent_ou ON parent_ou.id = ou.parent_id
        WHERE ou.id = w.org_unit_id AND ou.tenant_id = w.tenant_id
      )
      WHERE w.tenant_id = ${tenant_id} AND w.deleted_at IS NULL
    `);
  },
};
