import { describe, expect, it } from 'vitest';
import { resetCoreDb } from '../src/db/client.ts';
import { withEmit } from '../src/events/with-emit.ts';
import { requestNotification } from '../src/notifications/index.ts';
import { withCoreTestDb } from '../test/test-helpers.ts';

describe('requestNotification', () => {
  it('writes exactly one core.notification.requested event row inside the caller tx', async () => {
    await withCoreTestDb(async ({ pool }) => {
      resetCoreDb();
      const tenantId = crypto.randomUUID();
      const sourceEventId = crypto.randomUUID();
      const u1 = crypto.randomUUID();
      const u2 = crypto.randomUUID();

      await pool.query(
        `INSERT INTO core.events (id, tenant_id, aggregate_type, aggregate_id,
                                  event_type, event_version, payload)
         VALUES ($1, $2, 'test', 'test', 'test.thing.happened', 1, '{}'::jsonb)`,
        [sourceEventId, tenantId],
      );

      await withEmit(undefined, async () => {
        await requestNotification({
          event_type: 'planner.task.mentioned',
          user_ids: [u1, u2],
          payload: { title: 'You were mentioned' },
          source_event_id: sourceEventId,
          tenant_id: tenantId,
        });
      });

      const rows = await pool.query<{ payload: Record<string, unknown> }>(
        `SELECT payload FROM core.events
          WHERE event_type = 'core.notification.requested'
            AND tenant_id = $1::uuid`,
        [tenantId],
      );
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]?.payload).toMatchObject({
        target_event_type: 'planner.task.mentioned',
        target_payload: { title: 'You were mentioned' },
        user_ids: [u1, u2],
        source_event_id: sourceEventId,
      });
    });
  });

  it('rolls back when the caller tx throws', async () => {
    await withCoreTestDb(async ({ pool }) => {
      resetCoreDb();
      const tenantId = crypto.randomUUID();
      const sourceEventId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO core.events (id, tenant_id, aggregate_type, aggregate_id,
                                  event_type, event_version, payload)
         VALUES ($1, $2, 'test', 'test', 'test.thing.happened', 1, '{}'::jsonb)`,
        [sourceEventId, tenantId],
      );

      await expect(
        withEmit(undefined, async () => {
          await requestNotification({
            event_type: 'planner.task.mentioned',
            user_ids: [crypto.randomUUID()],
            payload: {},
            source_event_id: sourceEventId,
            tenant_id: tenantId,
          });
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      const rows = await pool.query(
        `SELECT 1 FROM core.events
          WHERE event_type = 'core.notification.requested'
            AND tenant_id = $1::uuid`,
        [tenantId],
      );
      expect(rows.rows).toHaveLength(0);
    });
  });
});
