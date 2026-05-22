import { describe, expect, it, vi } from 'vitest';
import { workflowsApi } from './workflows.ts';

function mockJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('workflowsApi', () => {
  it('listRuns calls /api/copilot/v1/workflows/runs with scope + cursor + limit', async () => {
    const fetchMock = vi.fn(async () => mockJsonResponse({ rows: [], nextCursor: null }));
    vi.stubGlobal('fetch', fetchMock);

    await workflowsApi.listRuns({ scope: 'self', cursor: 'abc', limit: 25 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0] as [string, RequestInit?] | undefined;
    const callUrl = String(firstCall?.[0]);
    expect(callUrl).toContain('/api/copilot/v1/workflows/runs?');
    expect(callUrl).toContain('scope=self');
    expect(callUrl).toContain('cursor=abc');
    expect(callUrl).toContain('limit=25');
  });

  it('getRun returns null on 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not found', { status: 404 })),
    );
    const out = await workflowsApi.getRun('abc-123');
    expect(out).toBeNull();
  });

  it('decideApproval POSTs body and parses response', async () => {
    const fetchMock = vi.fn(async () =>
      mockJsonResponse({ runId: 'run-1', decision: 'approve' as const, resumed: true }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const out = await workflowsApi.decideApproval('appr-1', { decision: 'approve' });

    expect(out.runId).toBe('run-1');
    expect(out.decision).toBe('approve');
    const firstCall = fetchMock.mock.calls[0] as [string, RequestInit] | undefined;
    expect(firstCall?.[1].method).toBe('POST');
    expect(JSON.parse(String(firstCall?.[1].body))).toEqual({ decision: 'approve' });
  });

  it('cancelRun POSTs /cancel and returns void on 200', async () => {
    const fetchMock = vi.fn(async () => mockJsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await workflowsApi.cancelRun('run-1');

    const firstCall = fetchMock.mock.calls[0] as [string, RequestInit] | undefined;
    expect(String(firstCall?.[0])).toContain('/api/copilot/v1/workflows/runs/run-1/cancel');
    expect(firstCall?.[1].method).toBe('POST');
  });

  it('replayFromStep POSTs /replay-from-step with stepId + payload, returns newRunId', async () => {
    const fetchMock = vi.fn(async () => mockJsonResponse({ newRunId: 'new-run-1' }));
    vi.stubGlobal('fetch', fetchMock);

    const out = await workflowsApi.replayFromStep('r1', 'step-b', { x: 2 });

    expect(out.newRunId).toBe('new-run-1');
    const firstCall = fetchMock.mock.calls[0] as [string, RequestInit] | undefined;
    expect(String(firstCall?.[0])).toContain('/workflows/runs/r1/replay-from-step');
    expect(firstCall?.[1].method).toBe('POST');
    expect(JSON.parse(String(firstCall?.[1].body))).toEqual({
      stepId: 'step-b',
      payload: { x: 2 },
    });
  });

  it('issueSseToken returns the token string', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => mockJsonResponse({ token: 'abc.def' })),
    );
    const out = await workflowsApi.issueSseToken();
    expect(out).toBe('abc.def');
  });
});
