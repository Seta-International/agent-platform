import { useQuery } from '@tanstack/react-query';
import type { UIMessage } from 'ai';

export interface ThreadMessagesResponse {
  thread: { id: string; title: string | null; updatedAt: string | null };
  messages: UIMessage[];
  page: number;
  perPage: number;
  total: number;
  hasMore: boolean;
}

async function fetchMessages(
  threadId: string,
  page = 0,
  perPage = 50,
): Promise<ThreadMessagesResponse> {
  const url = `/api/copilot/v1/threads/${encodeURIComponent(threadId)}?page=${page}&perPage=${perPage}`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`thread messages ${res.status}`);
  return (await res.json()) as ThreadMessagesResponse;
}

export function useThreadMessages(threadId: string | undefined) {
  return useQuery({
    queryKey: ['copilot', 'thread', threadId],
    queryFn: () => {
      if (!threadId) throw new Error('threadId required');
      return fetchMessages(threadId);
    },
    enabled: Boolean(threadId),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}
