export const CORE_NOTIFICATION_REQUESTED = 'core.notification.requested' as const;
export const CORE_NOTIFICATION_REQUESTED_VERSION = 1 as const;

export interface CoreNotificationRequestedPayload {
  target_event_type: string;
  target_payload: Record<string, unknown>;
  user_ids: string[];
  source_event_id: string;
}

export const CORE_TENANT_NOTIFICATION_PREFS_CHANGED =
  'core.tenant.notification_prefs.changed' as const;
export const CORE_TENANT_NOTIFICATION_PREFS_CHANGED_VERSION = 1 as const;

export interface CoreTenantNotificationPrefsChangedPayload {
  event_type: string;
  channel: 'in_app' | 'email';
  before: boolean | null;
  after: boolean | null;
  actor_user_id: string;
}
