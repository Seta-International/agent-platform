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
