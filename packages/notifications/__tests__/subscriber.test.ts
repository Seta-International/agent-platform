import { withEmit } from '@seta/core/events';
import type { SubscriberDef } from '@seta/shared-types';
import { describe, expect, it } from 'vitest';
import { resetNotificationsDb } from '../src/backend/db/client.ts';
import { notifierSubscriber, requestNotification } from '../src/index.ts';
import { waitFor, withDispatcher, withNotificationsTestDb } from './test-helpers.ts';

describe('core.notifier subscriber', () => {
  it('fans out one row per user and pg_notifies notifications_changes with user_id', async () => {
    await withNotificationsTestDb(async ({ pool }) => {
      resetNotificationsDb();
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
        if (msg.channel === 'notifications_changes' && msg.payload) received.push(msg.payload);
      });
      await listener.query('LISTEN notifications_changes');

      try {
        await withDispatcher(
          { subscribers: [notifierSubscriber() as SubscriberDef], pool },
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
                `SELECT COUNT(*)::text AS n FROM notifications.notifications WHERE source_event_id = $1`,
                [sourceEventId],
              );
              return r.rows[0]?.n === '2';
            });
          },
        );

        await waitFor(() => received.length === 2);
        expect(received.sort()).toEqual([u1, u2].sort());
      } finally {
        await listener.query('UNLISTEN notifications_changes');
        listener.release();
      }
    });
  });

  it('is idempotent on retry — same source_event_id yields no new rows', async () => {
    await withNotificationsTestDb(async ({ pool }) => {
      resetNotificationsDb();
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
        { subscribers: [notifierSubscriber() as SubscriberDef], pool },
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
              `SELECT COUNT(*)::text AS n FROM notifications.notifications WHERE source_event_id = $1`,
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
            `SELECT COUNT(*)::text AS n FROM notifications.notifications WHERE source_event_id = $1`,
            [sourceEventId],
          );
          expect(r.rows[0]?.n).toBe('1');
        },
      );
    });
  });

  it('skips insert when tenant pref has enabled=false', async () => {
    await withNotificationsTestDb(async ({ pool }) => {
      resetNotificationsDb();
      const tenantId = crypto.randomUUID();
      const sourceEventId = crypto.randomUUID();
      const u1 = crypto.randomUUID();

      await pool.query(
        `INSERT INTO core.events (id, tenant_id, aggregate_type, aggregate_id,
                                  event_type, event_version, payload)
         VALUES ($1, $2, 'test', 'test', 'test.thing.happened', 1, '{}'::jsonb)`,
        [sourceEventId, tenantId],
      );
      await pool.query(
        `INSERT INTO notifications.notification_prefs (tenant_id, event_type, channel, enabled)
         VALUES ($1, $2, 'in_app', $3)`,
        [tenantId, 'planner.task.assigned', false],
      );

      await withDispatcher(
        { subscribers: [notifierSubscriber() as SubscriberDef], pool },
        async () => {
          await withEmit(undefined, async () => {
            await requestNotification({
              tenant_id: tenantId,
              event_type: 'planner.task.assigned',
              user_ids: [u1],
              payload: {},
              source_event_id: sourceEventId,
            });
          });
          await new Promise((r) => setTimeout(r, 500));
          const r = await pool.query<{ n: string }>(
            `SELECT COUNT(*)::text AS n FROM notifications.notifications WHERE source_event_id = $1`,
            [sourceEventId],
          );
          expect(r.rows[0]?.n).toBe('0');
        },
      );
    });
  });

  it('inserts when no pref row exists (default ON)', async () => {
    await withNotificationsTestDb(async ({ pool }) => {
      resetNotificationsDb();
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

      await withDispatcher(
        { subscribers: [notifierSubscriber() as SubscriberDef], pool },
        async () => {
          await withEmit(undefined, async () => {
            await requestNotification({
              tenant_id: tenantId,
              event_type: 'planner.task.assigned',
              user_ids: [u1, u2],
              payload: {},
              source_event_id: sourceEventId,
            });
          });
          await waitFor(async () => {
            const r = await pool.query<{ n: string }>(
              `SELECT COUNT(*)::text AS n FROM notifications.notifications WHERE source_event_id = $1`,
              [sourceEventId],
            );
            return r.rows[0]?.n === '2';
          });
          const r = await pool.query<{ n: string }>(
            `SELECT COUNT(*)::text AS n FROM notifications.notifications WHERE source_event_id = $1`,
            [sourceEventId],
          );
          expect(r.rows[0]?.n).toBe('2');
        },
      );
    });
  });

  it('inserts when tenant pref has enabled=true', async () => {
    await withNotificationsTestDb(async ({ pool }) => {
      resetNotificationsDb();
      const tenantId = crypto.randomUUID();
      const sourceEventId = crypto.randomUUID();
      const u1 = crypto.randomUUID();

      await pool.query(
        `INSERT INTO core.events (id, tenant_id, aggregate_type, aggregate_id,
                                  event_type, event_version, payload)
         VALUES ($1, $2, 'test', 'test', 'test.thing.happened', 1, '{}'::jsonb)`,
        [sourceEventId, tenantId],
      );
      await pool.query(
        `INSERT INTO notifications.notification_prefs (tenant_id, event_type, channel, enabled)
         VALUES ($1, $2, 'in_app', $3)`,
        [tenantId, 'planner.task.assigned', true],
      );

      await withDispatcher(
        { subscribers: [notifierSubscriber() as SubscriberDef], pool },
        async () => {
          await withEmit(undefined, async () => {
            await requestNotification({
              tenant_id: tenantId,
              event_type: 'planner.task.assigned',
              user_ids: [u1],
              payload: {},
              source_event_id: sourceEventId,
            });
          });
          await waitFor(async () => {
            const r = await pool.query<{ n: string }>(
              `SELECT COUNT(*)::text AS n FROM notifications.notifications WHERE source_event_id = $1`,
              [sourceEventId],
            );
            return r.rows[0]?.n === '1';
          });
          const r = await pool.query<{ n: string }>(
            `SELECT COUNT(*)::text AS n FROM notifications.notifications WHERE source_event_id = $1`,
            [sourceEventId],
          );
          expect(r.rows[0]?.n).toBe('1');
        },
      );
    });
  });
});
