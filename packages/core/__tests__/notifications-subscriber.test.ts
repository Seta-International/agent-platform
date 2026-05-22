import type { SubscriberDef } from '@seta/shared-types';
import { describe, expect, it } from 'vitest';
import { resetCoreDb } from '../src/db/client.ts';
import { withEmit } from '../src/events/with-emit.ts';
import { coreNotifierSubscriber, requestNotification } from '../src/notifications/index.ts';
import { waitFor, withCoreTestDb, withDispatcher } from '../test/test-helpers.ts';

describe('core.notifier subscriber', () => {
  it('fans out one row per user and pg_notifies core_notifications with user_id', async () => {
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

      const listener = await pool.connect();
      const received: string[] = [];
      listener.on('notification', (msg) => {
        if (msg.channel === 'core_notifications' && msg.payload) received.push(msg.payload);
      });
      await listener.query('LISTEN core_notifications');

      try {
        await withDispatcher(
          { subscribers: [coreNotifierSubscriber() as SubscriberDef], pool },
          async () => {
            await withEmit(undefined, async () => {
              await requestNotification({
                tenant_id: tenantId,
                event_type: 'planner.task.mentioned',
                user_ids: [u1, u2],
                payload: { title: 'hi' },
                source_event_id: sourceEventId,
              });
            });

            await waitFor(async () => {
              const r = await pool.query<{ n: string }>(
                `SELECT COUNT(*)::text AS n FROM core.notifications WHERE source_event_id = $1`,
                [sourceEventId],
              );
              return r.rows[0]?.n === '2';
            });
          },
        );

        await waitFor(() => received.length === 2);
        expect(received.sort()).toEqual([u1, u2].sort());
      } finally {
        await listener.query('UNLISTEN core_notifications');
        listener.release();
      }
    });
  });

  it('is idempotent on retry — same source_event_id yields no new rows', async () => {
    await withCoreTestDb(async ({ pool }) => {
      resetCoreDb();
      const tenantId = crypto.randomUUID();
      const sourceEventId = crypto.randomUUID();
      const u1 = crypto.randomUUID();

      await pool.query(
        `INSERT INTO core.events (id, tenant_id, aggregate_type, aggregate_id,
                                  event_type, event_version, payload)
         VALUES ($1, $2, 'test', 'test', 'test.thing.happened', 1, '{}'::jsonb)`,
        [sourceEventId, tenantId],
      );

      await withDispatcher(
        { subscribers: [coreNotifierSubscriber() as SubscriberDef], pool },
        async () => {
          await withEmit(undefined, async () => {
            await requestNotification({
              tenant_id: tenantId,
              event_type: 'planner.task.mentioned',
              user_ids: [u1],
              payload: {},
              source_event_id: sourceEventId,
            });
          });
          await waitFor(async () => {
            const r = await pool.query<{ n: string }>(
              `SELECT COUNT(*)::text AS n FROM core.notifications WHERE source_event_id = $1`,
              [sourceEventId],
            );
            return r.rows[0]?.n === '1';
          });
          await withEmit(undefined, async () => {
            await requestNotification({
              tenant_id: tenantId,
              event_type: 'planner.task.mentioned',
              user_ids: [u1],
              payload: {},
              source_event_id: sourceEventId,
            });
          });
          await new Promise((r) => setTimeout(r, 500));
          const r = await pool.query<{ n: string }>(
            `SELECT COUNT(*)::text AS n FROM core.notifications WHERE source_event_id = $1`,
            [sourceEventId],
          );
          expect(r.rows[0]?.n).toBe('1');
        },
      );
    });
  });
});
