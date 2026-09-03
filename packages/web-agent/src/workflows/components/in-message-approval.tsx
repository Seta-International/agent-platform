import { useThreadApprovals } from '../hooks/use-thread-approvals.ts';
import { ApprovalList } from './approval-list.tsx';

export interface InMessageApprovalProps {
  threadId: string | undefined;
  toolCallId: string;
}

/**
 * The approval card rendered where it was raised. The turn persists only a
 * `data-approval` anchor carrying the toolCallId; the card body comes from the
 * approval row, so the same spot shows the interactive card while pending and
 * the outcome once decided — including after a reload.
 *
 * Renders nothing until the row loads, or when the row belongs to another
 * approver: an anchor without a readable row is a card the viewer may not act on.
 */
export function InMessageApproval({ threadId, toolCallId }: InMessageApprovalProps) {
  const approvalsQuery = useThreadApprovals(threadId);
  const approval = approvalsQuery.data?.find((a) => a.toolCallId === toolCallId);
  if (!approval) return null;
  return <ApprovalList approvals={[approval]} threadId={threadId} />;
}
