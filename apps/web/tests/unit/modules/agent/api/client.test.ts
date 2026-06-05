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
});
