import type { QueryClient } from '@tanstack/react-query';
import { copilotApi } from '../api/client';
import type { ThreadSummary } from '../api/schemas';
import { notifyApprovalResolved } from '../hooks/use-approval-events';

export function splitApprovalId(composite: string | undefined): {
  runId?: string;
  toolCallId?: string;
} {
  if (!composite) return {};
  const [runId, toolCallId] = composite.split('::');
  return { runId, toolCallId };
}

// After server-side resume, the freshest thread in the rail is the one our run
// wrote to — works for both "user was already on a thread" and "user started in
// New conversation" cases without us tracking assistant-ui's local thread id.
async function refetchTopmostThreadId(
  queryClient: QueryClient,
  fallback: string | undefined,
): Promise<string | undefined> {
  try {
    await queryClient.invalidateQueries({ queryKey: ['copilot', 'threads'] });
    const threads = await queryClient.fetchQuery<ThreadSummary[]>({
      queryKey: ['copilot', 'threads'],
      queryFn: () => copilotApi.listThreads(),
    });
    if (!Array.isArray(threads) || threads.length === 0) return fallback;
    const sorted = [...threads].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    return sorted[0]?.id ?? fallback;
  } catch {
    return fallback;
  }
}

export interface ResolveApprovalArgs {
  queryClient: QueryClient;
  parentAgentName: string;
  runId: string;
  toolCallId: string;
  approved: boolean;
  /** Thread id known from the URL, when the user was already on a thread page. */
  knownThreadId?: string;
}

export async function resolveApproval(args: ResolveApprovalArgs): Promise<void> {
  await copilotApi.resolveApproval(args.parentAgentName, {
    runId: args.runId,
    toolCallId: args.toolCallId,
    approved: args.approved,
    ...(args.knownThreadId ? { threadId: args.knownThreadId } : {}),
  });
  const resolvedThreadId = await refetchTopmostThreadId(args.queryClient, args.knownThreadId);
  if (resolvedThreadId) {
    void args.queryClient.invalidateQueries({
      queryKey: ['copilot', 'thread', resolvedThreadId],
    });
  }
  notifyApprovalResolved({ threadId: resolvedThreadId });
}
