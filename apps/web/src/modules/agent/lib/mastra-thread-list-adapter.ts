import type { RemoteThreadListAdapter } from '@assistant-ui/react';
import { agentApi } from '../api/client';

async function fetchThreadMetadata(
  threadId: string,
): Promise<{ status: 'regular'; remoteId: string; title?: string }> {
  const res = await fetch(
    `/api/agent/v1/threads/${encodeURIComponent(threadId)}?page=0&perPage=0`,
    { credentials: 'include' },
  );
  if (res.status === 404) {
    // Fresh client-minted id: the Mastra row will be created lazily on the
    // first send. Synthesize empty metadata so AUI accepts the id as the
    // current thread and uses it on outgoing requests.
    return { status: 'regular', remoteId: threadId };
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw Object.assign(new Error(err.message ?? `fetch thread ${res.status}`), {
      status: res.status,
    });
  }
  const body = (await res.json()) as { thread: { id: string; title: string | null } };
  return {
    status: 'regular',
    remoteId: body.thread.id,
    ...(body.thread.title ? { title: body.thread.title } : {}),
  };
}

/**
 * `RemoteThreadListAdapter` that maps Mastra backend threads into AUI's
 * remote thread list protocol.
 *
 * Key contract: `initialize(threadId)` echoes back `{ remoteId: threadId }`.
 * Combined with `useRemoteThreadListRuntime({ threadId })`, this ensures AUI
 * always sends the correct Mastra thread ID to the server on every request —
 * eliminating the bug where a remounted runtime generated a new internal UUID
 * and created a fresh Mastra thread each time the component remounted.
 */
export const mastraThreadListAdapter: RemoteThreadListAdapter = {
  async list() {
    const threads = await agentApi.listThreads();
    return {
      threads: threads.map((t) => ({
        status: 'regular' as const,
        remoteId: t.id,
        ...(t.title ? { title: t.title } : {}),
      })),
    };
  },

  async initialize(threadId) {
    // New threads are created lazily by the server on the first message.
    // Echoing the ID back tells AUI to use this exact ID in all requests.
    return { remoteId: threadId, externalId: undefined };
  },

  async fetch(threadId) {
    return fetchThreadMetadata(threadId);
  },

  async rename(remoteId, newTitle) {
    await agentApi.renameThread(remoteId, newTitle);
  },

  async delete(remoteId) {
    await agentApi.deleteThread(remoteId);
  },

  async archive() {
    // Mastra doesn't support thread archiving; treat as no-op.
  },

  async unarchive() {
    // Mastra doesn't support thread archiving; treat as no-op.
  },

  generateTitle() {
    // The server generates titles itself via Mastra; return an immediately-closed empty stream.
    // Cast via `never` since ReadableStream<never> satisfies AssistantStream structurally.
    return Promise.resolve(
      new ReadableStream({
        start(c) {
          c.close();
        },
      }) as never,
    );
  },
};
