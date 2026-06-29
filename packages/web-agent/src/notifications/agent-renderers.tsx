import type { NotificationListItemNotification } from '@seta/shared-ui';
import { useNavigate } from '@tanstack/react-router';
import { BellRing } from 'lucide-react';
import type * as React from 'react';

type AgentApprovalPayload = {
  run_id?: string;
};

export function useResolveAgentNotification(notification: NotificationListItemNotification): {
  icon?: React.ReactNode;
  onClick?: () => void;
} {
  const navigate = useNavigate();

  if (notification.event_type !== 'agent.workflow.approval.requested') return {};

  const payload = (notification.payload ?? {}) as AgentApprovalPayload;
  const runId = payload.run_id;

  return {
    icon: <BellRing className="size-4" aria-hidden />,
    onClick: runId
      ? () => {
          void navigate({
            to: '/agent/workflows/runs/$runId',
            params: { runId },
            search: {},
          } as never);
        }
      : undefined,
  };
}
