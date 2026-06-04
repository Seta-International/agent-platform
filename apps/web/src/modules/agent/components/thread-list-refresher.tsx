import { useAuiState } from '@assistant-ui/react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { workflowsQueryKeys } from '../workflows/state/query-keys.ts';

interface Props {
  threadId?: string;
}

/**
 * Side-effect bridge that invalidates the relevant queries the moment an
 * assistant turn ends. The thread list itself owns the title-generation poll
 * (`useThreadList` configures `refetchInterval` while any recent thread is
 * still missing a title), so this component is intentionally tiny: it only
 * triggers the immediate refetch that primes that poll.
 */
export function ThreadListRefresher({ threadId }: Props) {
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const wasRunning = useRef(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const justEnded = wasRunning.current && !isRunning;
    wasRunning.current = isRunning;
    if (!justEnded) return;

    void queryClient.invalidateQueries({ queryKey: ['agent', 'threads'] });
    if (threadId) {
      void queryClient.invalidateQueries({ queryKey: ['agent', 'thread', threadId] });
      // Chat-flow HITL: if the agent recorded an approval card this turn, the
      // row is now committed. Invalidate so ChatEmbeddedHitl picks it up
      // without waiting for the next focus event.
      void queryClient.invalidateQueries({
        queryKey: workflowsQueryKeys.threadApprovals(threadId),
      });
    }
    void queryClient.invalidateQueries({ queryKey: workflowsQueryKeys.pendingApprovals() });
  }, [isRunning, queryClient, threadId]);

  return null;
}
