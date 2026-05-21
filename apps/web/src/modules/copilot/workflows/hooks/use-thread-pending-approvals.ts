import { usePendingApprovals } from './use-pending-approvals.ts';

export function useThreadPendingApprovals(threadId: string | undefined) {
  const all = usePendingApprovals();
  const rows = all.data ?? [];
  const filtered = threadId
    ? rows.filter((approval) => approval.surfaceChatThreadId === threadId)
    : [];
  return { ...all, data: filtered };
}
