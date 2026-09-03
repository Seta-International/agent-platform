import { useAuiState } from '@assistant-ui/react';
import { useMemo } from 'react';
import { useThreadApprovals } from '../hooks/use-thread-approvals.ts';
import { anchoredToolCallIds, tailApprovals } from './approval-anchor.ts';
import { ApprovalList } from './approval-list.tsx';

export interface ChatEmbeddedHitlProps {
  threadId: string | undefined;
}

/**
 * The transcript's tail section for approvals that no turn claims: rows raised
 * outside a chat tool call (workflow lifecycle approvals), and anchored rows
 * whose turn is not on screen. Every approval raised by a chat turn renders
 * in place instead — see InMessageApproval.
 */
export function ChatEmbeddedHitl({ threadId }: ChatEmbeddedHitlProps) {
  const approvalsQuery = useThreadApprovals(threadId);
  const messages = useAuiState((s) => s.thread.messages);
  const approvals = approvalsQuery.data;

  const tail = useMemo(
    () => tailApprovals(approvals ?? [], anchoredToolCallIds(messages ?? [])),
    [approvals, messages],
  );

  return <ApprovalList approvals={tail} threadId={threadId} />;
}
