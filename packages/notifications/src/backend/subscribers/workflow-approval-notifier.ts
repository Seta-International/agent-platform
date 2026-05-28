import type { DomainEvent, SubscriberCtx, SubscriberDef } from '@seta/shared-types';
import { requestNotification } from '../domain/request.ts';

interface WorkflowApprovalRequestedPayload {
  approval_id: string;
  workflow_id: string;
  tenant_id: string;
  approver_user_id: string;
  proposed_payload: unknown;
  expires_at: string;
  surface: Array<'canvas' | 'chat'>;
}

async function handle(
  event: DomainEvent<WorkflowApprovalRequestedPayload>,
  _ctx: SubscriberCtx,
): Promise<void> {
  const { approver_user_id, workflow_id, approval_id } = event.payload;

  await requestNotification({
    tenant_id: event.tenantId,
    event_type: 'agent.workflow.approval.requested',
    user_ids: [approver_user_id],
    source_event_id: approval_id,
    payload: {
      title: 'Your assign-by-skill run needs your approval',
      body: 'A workflow run is paused waiting for your decision.',
      run_id: event.aggregateId,
      workflow_id,
    },
  });
}

export function workflowApprovalNotifierSubscriber(): SubscriberDef<WorkflowApprovalRequestedPayload> {
  return {
    subscription: 'notifications.workflow-approval.notify',
    event: 'agent.workflow.approval.requested',
    eventVersion: 1,
    handler: handle,
  };
}
