import { describe, expect, it, vi } from 'vitest';
import { agentApi } from '@/modules/agent/api/client';

describe('agentApi', () => {
  it('listThreads parses the JSON response shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              threads: [{ id: 't1', title: 'x', updatedAt: '2026-05-20T00:00:00Z' }],
            }),
            { headers: { 'content-type': 'application/json' } },
          ),
      ),
    );
    const out = await agentApi.listThreads();
    expect(out[0]?.id).toBe('t1');
  });

  it('resolveApproval POSTs the run/tool/approval payload and drains the SSE response', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response('data: [DONE]\n\n', {
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );
    await agentApi.resolveApproval({
      runId: 'run-1',
      toolCallId: 'call-1',
      approved: true,
      threadId: 't-1',
    });
    expect(calls[0]?.url).toBe('/api/agent/v1/chat/approve');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      runId: 'run-1',
      toolCallId: 'call-1',
      approved: true,
      threadId: 't-1',
    });
  });

  it('resolveApproval forwards resumeData when provided (multi-option HITL)', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response('data: [DONE]\n\n', {
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );
    await agentApi.resolveApproval({
      runId: 'run-1',
      toolCallId: 'call-1',
      approved: true,
      resumeData: { kind: 'link', existingId: 'task-7', mode: 'related' },
    });
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      runId: 'run-1',
      toolCallId: 'call-1',
      approved: true,
      resumeData: { kind: 'link', existingId: 'task-7', mode: 'related' },
    });
  });
});
