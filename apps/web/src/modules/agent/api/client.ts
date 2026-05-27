import type { ThreadSummary } from './schemas';
import { ThreadsResponse } from './schemas';

async function fetchJson<T>(
  url: string,
  init?: RequestInit,
  schema?: { parse: (v: unknown) => T },
): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: 'unknown' }))) as {
      error?: string;
      message?: string;
    };
    throw Object.assign(new Error(body.message ?? res.statusText), {
      status: res.status,
      code: body.error,
    });
  }
  const json = (await res.json()) as unknown;
  return schema ? schema.parse(json) : (json as T);
}

export const agentApi = {
  async listThreads(): Promise<ThreadSummary[]> {
    const out = await fetchJson('/api/agent/v1/threads', undefined, ThreadsResponse);
    return out.threads;
  },
  async resolveApproval(body: {
    runId: string;
    toolCallId: string;
    approved: boolean;
    threadId?: string;
    /**
     * Optional custom resume payload. When set (and approved=true), the
     * server hands this directly to the suspended tool's `ctx.agent.resumeData`
     * instead of the default `{approved: true}` — used by tools like
     * `planner_createTask` that expose multiple approval choices (e.g. the
     * dedup card's Create-new / Related to #N / Sub-task of #N picks).
     */
    resumeData?: unknown;
  }): Promise<void> {
    const res = await fetch('/api/agent/v1/chat/approve', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      throw Object.assign(new Error(err.message ?? res.statusText), {
        status: res.status,
        code: err.error,
      });
    }
    // Drain the SSE so the server-side resume runs to completion before we return.
    const reader = res.body?.getReader();
    if (reader) {
      try {
        // Sequential by necessity: each read() call depends on the previous chunk's `done` flag.
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      } finally {
        reader.releaseLock();
      }
    }
  },
  async renameThread(id: string, title: string) {
    await fetchJson(`/api/agent/v1/threads/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title }),
    });
  },
  async deleteThread(id: string) {
    await fetchJson(`/api/agent/v1/threads/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
};
