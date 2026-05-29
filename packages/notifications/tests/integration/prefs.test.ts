import type { SessionScope } from '@seta/core';
import { coreEvents } from '@seta/core/db/schema';
import { withEmit } from '@seta/core/events';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { notificationsDb, resetNotificationsDb } from '../../src/backend/db/client.ts';
import { notificationPrefs } from '../../src/backend/db/schema/notification-prefs.ts';
import {
  listNotificationPrefs,
  NOTIFICATION_CATEGORIES,
  NotificationPrefError,
  setNotificationPref,
} from '../../src/index.ts';
import { withNotificationsTestDb } from './test-helpers.ts';

function makeAdminSession(overrides: Partial<SessionScope> = {}): SessionScope {
  return {
    session_id: crypto.randomUUID(),
    user_id: crypto.randomUUID(),
    tenant_id: crypto.randomUUID(),
    email: 'admin@example.com',
    display_name: 'Admin',
    role_summary: { roles: ['tenant.admin'], cross_tenant_read: false },
    role_summary_hash: 'h',
    accessible_group_ids: [],
    cross_tenant_read: false,
    built_at: new Date(),
    invalidated_at: null,
    ...overrides,
  };
}

describe('listNotificationPrefs', () => {
  it('returns one row per category with defaults when no prefs exist', async () => {
    await withNotificationsTestDb(async () => {
      resetNotificationsDb();
      const session = makeAdminSession();
      const result = await listNotificationPrefs({ session });
      expect(result.rows).toHaveLength(NOTIFICATION_CATEGORIES.length);
      expect(result.rows[0]).toMatchObject({
        event_type: 'planner.task.assigned',
        label: 'Task assigned',
        in_app_enabled: true,
        email_enabled: false,
        email_available: false,
      });
    });
  });

  it('applies stored prefs over defaults', async () => {
    await withNotificationsTestDb(async () => {
      resetNotificationsDb();
      const session = makeAdminSession();
      await notificationsDb().insert(notificationPrefs).values({
        tenantId: session.tenant_id,
        eventType: 'planner.task.assigned',
        channel: 'in_app',
        enabled: false,
        updatedBy: session.user_id,
      });
      const result = await listNotificationPrefs({ session });
      const row = result.rows.find((r) => r.event_type === 'planner.task.assigned');
      expect(row?.in_app_enabled).toBe(false);
      expect(row?.email_enabled).toBe(false);
    });
  });

  it('scopes by tenant', async () => {
    await withNotificationsTestDb(async () => {
      resetNotificationsDb();
      const session = makeAdminSession();
      const otherTenant = crypto.randomUUID();
      await notificationsDb().insert(notificationPrefs).values({
        tenantId: otherTenant,
        eventType: 'planner.task.assigned',
        channel: 'in_app',
        enabled: false,
        updatedBy: session.user_id,
      });
      const result = await listNotificationPrefs({ session });
      const row = result.rows.find((r) => r.event_type === 'planner.task.assigned');
      expect(row?.in_app_enabled).toBe(true);
    });
  });

  it('refuses non-admin', async () => {
    await withNotificationsTestDb(async () => {
      resetNotificationsDb();
      const session = makeAdminSession({
        role_summary: { roles: ['planner.member'], cross_tenant_read: false },
      });
      await expect(listNotificationPrefs({ session })).rejects.toBeInstanceOf(
        NotificationPrefError,
      );
    });
  });
});

describe('setNotificationPref', () => {
  it('upserts when value diverges from default', async () => {
    await withNotificationsTestDb(async () => {
      resetNotificationsDb();
      const session = makeAdminSession();
      await withEmit(
        { actor: { userId: session.user_id, tenantId: session.tenant_id } },
        async () => {
          await setNotificationPref({
            event_type: 'planner.task.assigned',
            channel: 'in_app',
            enabled: false,
            session,
          });
        },
      );
      const rows = await notificationsDb().select().from(notificationPrefs);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ enabled: false, updatedBy: session.user_id });
    });
  });

  it('deletes the row when value returns to default', async () => {
    await withNotificationsTestDb(async () => {
      resetNotificationsDb();
      const session = makeAdminSession();
      await notificationsDb().insert(notificationPrefs).values({
        tenantId: session.tenant_id,
        eventType: 'planner.task.assigned',
        channel: 'in_app',
        enabled: false,
        updatedBy: session.user_id,
      });
      await withEmit(
        { actor: { userId: session.user_id, tenantId: session.tenant_id } },
        async () => {
          await setNotificationPref({
            event_type: 'planner.task.assigned',
            channel: 'in_app',
            enabled: true,
            session,
          });
        },
      );
      const rows = await notificationsDb().select().from(notificationPrefs);
      expect(rows).toHaveLength(0);
    });
  });

  it('rejects unknown event_type', async () => {
    await withNotificationsTestDb(async () => {
      resetNotificationsDb();
      const session = makeAdminSession();
      await expect(
        withEmit({ actor: { userId: session.user_id, tenantId: session.tenant_id } }, () =>
          setNotificationPref({
            event_type: 'unknown.event',
            channel: 'in_app',
            enabled: false,
            session,
          }),
        ),
      ).rejects.toBeInstanceOf(NotificationPrefError);
    });
  });

  it('emits notification.tenant_prefs.changed with before/after', async () => {
    await withNotificationsTestDb(async () => {
      resetNotificationsDb();
      const session = makeAdminSession();
      await notificationsDb().insert(notificationPrefs).values({
        tenantId: session.tenant_id,
        eventType: 'planner.task.assigned',
        channel: 'in_app',
        enabled: false,
        updatedBy: session.user_id,
      });
      await withEmit(
        { actor: { userId: session.user_id, tenantId: session.tenant_id } },
        async () => {
          await setNotificationPref({
            event_type: 'planner.task.assigned',
            channel: 'in_app',
            enabled: true,
            session,
          });
        },
      );
      const events = await notificationsDb()
        .select()
        .from(coreEvents)
        .where(eq(coreEvents.eventType, 'notification.tenant_prefs.changed'));
      expect(events).toHaveLength(1);
      const payload = events[0]?.payload as Record<string, unknown>;
      expect(payload).toMatchObject({
        event_type: 'planner.task.assigned',
        channel: 'in_app',
        before: false,
        after: null,
        actor_user_id: session.user_id,
      });
    });
  });

  it('refuses non-admin', async () => {
    await withNotificationsTestDb(async () => {
      resetNotificationsDb();
      const session = makeAdminSession({
        role_summary: { roles: ['planner.member'], cross_tenant_read: false },
      });
      await expect(
        withEmit({ actor: { userId: session.user_id, tenantId: session.tenant_id } }, () =>
          setNotificationPref({
            event_type: 'planner.task.assigned',
            channel: 'in_app',
            enabled: false,
            session,
          }),
        ),
      ).rejects.toBeInstanceOf(NotificationPrefError);
    });
  });
});
