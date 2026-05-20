import { useAuiState } from '@assistant-ui/react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

interface Props {
  threadId?: string;
}

export function ThreadListRefresher({ threadId }: Props) {
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const wasRunning = useRef(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (wasRunning.current && !isRunning) {
      const refetchThreads = () =>
        queryClient.invalidateQueries({ queryKey: ['copilot', 'threads'] });
      void refetchThreads();
      if (threadId) {
        void queryClient.invalidateQueries({ queryKey: ['copilot', 'thread', threadId] });
      }
      // Mastra's generateTitle runs after the stream ends — re-poll so it lands in the rail.
      const timers = [setTimeout(refetchThreads, 1500), setTimeout(refetchThreads, 4000)];
      wasRunning.current = isRunning;
      return () => {
        for (const t of timers) clearTimeout(t);
      };
    }
    wasRunning.current = isRunning;
  }, [isRunning, queryClient, threadId]);

  return null;
}
