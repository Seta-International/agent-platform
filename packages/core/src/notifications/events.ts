export const CORE_NOTIFICATION_REQUESTED = 'core.notification.requested' as const;
export const CORE_NOTIFICATION_REQUESTED_VERSION = 1 as const;

export interface CoreNotificationRequestedPayload {
  target_event_type: string;
  target_payload: Record<string, unknown>;
  user_ids: string[];
  source_event_id: string;
}
