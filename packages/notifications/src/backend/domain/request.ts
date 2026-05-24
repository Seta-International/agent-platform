// rbac: system-only — called from event subscribers (e.g. planner task assigned),
// not from request handlers. No session is available; the source_event_id is the audit trail.
import { emit } from '@seta/core/events';
import {
  NOTIFICATION_REQUESTED,
  NOTIFICATION_REQUESTED_VERSION,
  type NotificationRequestedPayload,
} from '../../events.ts';

export interface RequestNotificationInput {
  tenant_id: string;
  event_type: string;
  user_ids: string[];
  payload: Record<string, unknown>;
  source_event_id: string;
}

export async function requestNotification(input: RequestNotificationInput): Promise<void> {
  if (input.user_ids.length === 0) return;

  const payload: NotificationRequestedPayload = {
    target_event_type: input.event_type,
    target_payload: input.payload,
    user_ids: input.user_ids,
    source_event_id: input.source_event_id,
  };

  await emit({
    tenantId: input.tenant_id,
    aggregateType: 'notification',
    aggregateId: input.source_event_id,
    eventType: NOTIFICATION_REQUESTED,
    eventVersion: NOTIFICATION_REQUESTED_VERSION,
    payload,
  });
}
