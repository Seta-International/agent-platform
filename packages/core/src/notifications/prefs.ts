import { hasPermission } from '@seta/shared-rbac';
import { and, eq } from 'drizzle-orm';
import { coreDb } from '../db/client.ts';
import { coreNotificationPrefs } from '../db/schema/notification-prefs.ts';
import { emitContext } from '../events/context.ts';
import { emit } from '../events/emit.ts';
import type { SessionScope } from '../session/scope.ts';
import { findCategory, NOTIFICATION_CATEGORIES } from './categories.ts';
import {
  CORE_TENANT_NOTIFICATION_PREFS_CHANGED,
  CORE_TENANT_NOTIFICATION_PREFS_CHANGED_VERSION,
} from './events.ts';

export const NOTIFICATIONS_WRITE_PERMISSION = 'core.tenant.notifications.write';

export type NotificationPrefErrorCode = 'FORBIDDEN' | 'UNKNOWN_EVENT_TYPE' | 'NO_EMIT_CONTEXT';

export class NotificationPrefError extends Error {
  readonly code: NotificationPrefErrorCode;
  constructor(code: NotificationPrefErrorCode, message: string) {
    super(message);
    this.name = 'NotificationPrefError';
    this.code = code;
  }
}

function requireNotificationsAdmin(session: SessionScope): void {
  const allowed = hasPermission(
    {
      roles: session.role_summary.roles,
      cross_tenant_read: session.role_summary.cross_tenant_read,
    },
    NOTIFICATIONS_WRITE_PERMISSION,
  );
  if (!allowed) {
    throw new NotificationPrefError(
      'FORBIDDEN',
      `Missing permission: ${NOTIFICATIONS_WRITE_PERMISSION}`,
    );
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
  requireNotificationsAdmin(input.session);

  const stored = await coreDb()
    .select({
      eventType: coreNotificationPrefs.eventType,
      channel: coreNotificationPrefs.channel,
      enabled: coreNotificationPrefs.enabled,
    })
    .from(coreNotificationPrefs)
    .where(eq(coreNotificationPrefs.tenantId, input.session.tenant_id));

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
  requireNotificationsAdmin(input.session);

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
    .select({ enabled: coreNotificationPrefs.enabled })
    .from(coreNotificationPrefs)
    .where(
      and(
        eq(coreNotificationPrefs.tenantId, tenantId),
        eq(coreNotificationPrefs.eventType, input.event_type),
        eq(coreNotificationPrefs.channel, input.channel),
      ),
    )
    .limit(1);

  const before = existing ? existing.enabled : null;

  if (input.enabled === defaultValue) {
    if (existing) {
      await ctx.tx
        .delete(coreNotificationPrefs)
        .where(
          and(
            eq(coreNotificationPrefs.tenantId, tenantId),
            eq(coreNotificationPrefs.eventType, input.event_type),
            eq(coreNotificationPrefs.channel, input.channel),
          ),
        );
    }
  } else {
    await ctx.tx
      .insert(coreNotificationPrefs)
      .values({
        tenantId,
        eventType: input.event_type,
        channel: input.channel,
        enabled: input.enabled,
        updatedBy: actorUserId,
      })
      .onConflictDoUpdate({
        target: [
          coreNotificationPrefs.tenantId,
          coreNotificationPrefs.eventType,
          coreNotificationPrefs.channel,
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
    aggregateType: 'core.tenant',
    aggregateId: tenantId,
    eventType: CORE_TENANT_NOTIFICATION_PREFS_CHANGED,
    eventVersion: CORE_TENANT_NOTIFICATION_PREFS_CHANGED_VERSION,
    payload: {
      event_type: input.event_type,
      channel: input.channel,
      before,
      after,
      actor_user_id: actorUserId,
    },
  });
}
