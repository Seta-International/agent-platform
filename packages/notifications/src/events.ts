import { z } from 'zod';

export const NOTIFICATION_REQUESTED = 'notification.requested' as const;
export const NOTIFICATION_REQUESTED_VERSION = 1 as const;

export interface NotificationRequestedPayload {
  target_event_type: string;
  target_payload: Record<string, unknown>;
  user_ids: string[];
  source_event_id: string;
}

export const NOTIFICATION_REQUESTED_PAYLOAD = z.object({
  target_event_type: z.string(),
  target_payload: z.record(z.string(), z.unknown()),
  user_ids: z.array(z.string()),
  source_event_id: z.string(),
});

export const NOTIFICATION_TENANT_PREFS_CHANGED = 'notification.tenant_prefs.changed' as const;
export const NOTIFICATION_TENANT_PREFS_CHANGED_VERSION = 1 as const;

export interface NotificationTenantPrefsChangedPayload {
  event_type: string;
  channel: 'in_app' | 'email';
  before: boolean | null;
  after: boolean | null;
  actor_user_id: string;
}

export const NOTIFICATION_TENANT_PREFS_CHANGED_PAYLOAD = z.object({
  event_type: z.string(),
  channel: z.enum(['in_app', 'email']),
  before: z.boolean().nullable(),
  after: z.boolean().nullable(),
  actor_user_id: z.string(),
});

export const NOTIFICATIONS_EVENTS = {
  [NOTIFICATION_REQUESTED]: NOTIFICATION_REQUESTED_PAYLOAD,
  [NOTIFICATION_TENANT_PREFS_CHANGED]: NOTIFICATION_TENANT_PREFS_CHANGED_PAYLOAD,
} as const;
