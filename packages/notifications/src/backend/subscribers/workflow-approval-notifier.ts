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

function titleForWorkflow(workflowId: string): string {
  const short = workflowId.replace(/^.*\./, '');
  switch (short) {
    case 'dedupOnCreate':
      return 'Duplicate check needs your decision';
    case 'assignBySkill':
      return 'Assignee suggestion needs your approval';
    default:
      return `Workflow "${short}" needs your approval`;
  }
}

function bodyForWorkflow(workflowId: string): string {
  const short = workflowId.replace(/^.*\./, '');
  switch (short) {
    case 'dedupOnCreate':
      return 'A newly created task may duplicate an existing one. Review and decide.';
    case 'assignBySkill':
      return 'A workflow run has suggested assignees. Review and approve.';
    default:
      return 'A workflow run is paused waiting for your decision.';
  }
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
      title: titleForWorkflow(workflow_id),
      body: bodyForWorkflow(workflow_id),
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
