import type { SessionScope } from '@seta/core';
import { emit, emitContext } from '@seta/core/events';
import { and, eq } from 'drizzle-orm';
import {
  NOTIFICATION_TENANT_PREFS_CHANGED,
  NOTIFICATION_TENANT_PREFS_CHANGED_VERSION,
} from '../../events.ts';
import { notificationsDb } from '../db/client.ts';
import { notificationPrefs } from '../db/schema/notification-prefs.ts';
import { NotificationsError, requirePermission } from '../rbac.ts';
import { findCategory, NOTIFICATION_CATEGORIES } from './categories.ts';

export type NotificationPrefErrorCode = 'FORBIDDEN' | 'UNKNOWN_EVENT_TYPE' | 'NO_EMIT_CONTEXT';

export class NotificationPrefError extends Error {
  readonly code: NotificationPrefErrorCode;
  constructor(code: NotificationPrefErrorCode, message: string) {
    super(message);
    this.name = 'NotificationPrefError';
    this.code = code;
  }
}

function requireNotificationsAdmin(
  session: SessionScope,
  permission: 'notifications.preference.read' | 'notifications.preference.write',
): void {
  try {
    requirePermission(session, permission);
  } catch (err) {
    if (err instanceof NotificationsError && err.code === 'FORBIDDEN') {
      throw new NotificationPrefError('FORBIDDEN', err.message);
    }
    throw err;
  }
}

export interface NotificationPrefRow {
  event_type: string;
  label: string;
  in_app_enabled: boolean;
  email_enabled: boolean;
  email_available: boolean;
}

export interface NotificationPrefMatrix {
  rows: NotificationPrefRow[];
}

export async function listNotificationPrefs(input: {
  session: SessionScope;
}): Promise<NotificationPrefMatrix> {
  requireNotificationsAdmin(input.session, 'notifications.preference.read');

  const stored = await notificationsDb()
    .select({
      eventType: notificationPrefs.eventType,
      channel: notificationPrefs.channel,
      enabled: notificationPrefs.enabled,
    })
    .from(notificationPrefs)
    .where(eq(notificationPrefs.tenantId, input.session.tenant_id));

  const lookup = new Map<string, boolean>();
  for (const row of stored) lookup.set(`${row.eventType}:${row.channel}`, row.enabled);

  const rows: NotificationPrefRow[] = NOTIFICATION_CATEGORIES.map((cat) => ({
    event_type: cat.event_type,
    label: cat.label,
    in_app_enabled: lookup.get(`${cat.event_type}:in_app`) ?? cat.default_in_app,
    email_enabled: lookup.get(`${cat.event_type}:email`) ?? cat.default_email,
    email_available: cat.email_available,
  }));

  return { rows };
}

export async function setNotificationPref(input: {
  event_type: string;
  channel: 'in_app' | 'email';
  enabled: boolean;
  session: SessionScope;
}): Promise<void> {
  requireNotificationsAdmin(input.session, 'notifications.preference.write');

  const cat = findCategory(input.event_type);
  if (!cat) {
    throw new NotificationPrefError(
      'UNKNOWN_EVENT_TYPE',
      `unknown event_type: ${input.event_type}`,
    );
  }

  const ctx = emitContext.getStore();
  if (!ctx) {
    throw new NotificationPrefError(
      'NO_EMIT_CONTEXT',
      'setNotificationPref must run inside withEmit() so the prefs write and audit emit share one transaction',
    );
  }

  const tenantId = input.session.tenant_id;
  const actorUserId = input.session.user_id;
  const defaultValue = input.channel === 'in_app' ? cat.default_in_app : cat.default_email;

  const [existing] = await ctx.tx
    .select({ enabled: notificationPrefs.enabled })
    .from(notificationPrefs)
    .where(
      and(
        eq(notificationPrefs.tenantId, tenantId),
        eq(notificationPrefs.eventType, input.event_type),
        eq(notificationPrefs.channel, input.channel),
      ),
    )
    .limit(1);

  const before = existing ? existing.enabled : null;

  if (input.enabled === defaultValue) {
    if (existing) {
      await ctx.tx
        .delete(notificationPrefs)
        .where(
          and(
            eq(notificationPrefs.tenantId, tenantId),
            eq(notificationPrefs.eventType, input.event_type),
            eq(notificationPrefs.channel, input.channel),
          ),
        );
    }
  } else {
    await ctx.tx
      .insert(notificationPrefs)
      .values({
        tenantId,
        eventType: input.event_type,
        channel: input.channel,
        enabled: input.enabled,
        updatedBy: actorUserId,
      })
      .onConflictDoUpdate({
        target: [
          notificationPrefs.tenantId,
          notificationPrefs.eventType,
          notificationPrefs.channel,
        ],
        set: {
          enabled: input.enabled,
          updatedAt: new Date(),
          updatedBy: actorUserId,
        },
      });
  }

  const after = input.enabled === defaultValue ? null : input.enabled;

  if (before === after) return;

  await emit({
    tenantId,
    aggregateType: 'notification.tenant',
    aggregateId: tenantId,
    eventType: NOTIFICATION_TENANT_PREFS_CHANGED,
    eventVersion: NOTIFICATION_TENANT_PREFS_CHANGED_VERSION,
    payload: {
      event_type: input.event_type,
      channel: input.channel,
      before,
      after,
      actor_user_id: actorUserId,
    },
  });
}
