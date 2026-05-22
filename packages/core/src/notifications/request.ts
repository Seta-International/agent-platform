import { emit } from '../events/emit.ts';
import {
  CORE_NOTIFICATION_REQUESTED,
  CORE_NOTIFICATION_REQUESTED_VERSION,
  type CoreNotificationRequestedPayload,
} from './events.ts';

export interface RequestNotificationInput {
  tenant_id: string;
  event_type: string;
  user_ids: string[];
  payload: Record<string, unknown>;
  source_event_id: string;
}

export async function requestNotification(input: RequestNotificationInput): Promise<void> {
  if (input.user_ids.length === 0) return;

  const payload: CoreNotificationRequestedPayload = {
    target_event_type: input.event_type,
    target_payload: input.payload,
    user_ids: input.user_ids,
    source_event_id: input.source_event_id,
  };

  await emit({
    tenantId: input.tenant_id,
    aggregateType: 'core.notification',
    aggregateId: input.source_event_id,
    eventType: CORE_NOTIFICATION_REQUESTED,
    eventVersion: CORE_NOTIFICATION_REQUESTED_VERSION,
    payload,
  });
}
