import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetGraphTokenCache, createGraphTransport } from '../../src/transports/graph.ts';

const ENV = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
};

function mockFetch(
  responses: Array<{
    status: number;
    body?: unknown;
    text?: string;
    headers?: Record<string, string>;
  }>,
) {
  let i = 0;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const r = responses[Math.min(i, responses.length - 1)]!;
    i++;
    return new Response(r.text ?? JSON.stringify(r.body ?? {}), {
      status: r.status,
      headers: r.headers ?? { 'content-type': 'application/json' },
    });
  });
  return Object.assign(fn, { calls });
}

beforeEach(() => {
  _resetGraphTokenCache();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('graph transport', () => {
  it('acquires a token then posts /sendMail and returns a message id', async () => {
    const fetchFn = mockFetch([
      { status: 200, body: { access_token: 'abc', expires_in: 3600 } },
      { status: 202, headers: { 'request-id': 'req-1' } },
    ]);
    const t = createGraphTransport({
      entraTenantId: 'e1',
      sender: 'noreply@acme.test',
      ...ENV,
      fetchImpl: fetchFn as unknown as typeof fetch,
    });
    const out = await t.send({
      from: 'noreply@acme.test',
      to: 'a@example.com',
      subject: 's',
      html: '<p>x</p>',
      text: 'x',
    });
    expect(out.messageId).toBe('req-1');
    expect(fetchFn.calls[0]!.url).toContain('/oauth2/v2.0/token');
    expect(fetchFn.calls[1]!.url).toContain('/users/noreply%40acme.test/sendMail');
  });

  it('classifies 401 as permanent', async () => {
    const fetchFn = mockFetch([
      { status: 200, body: { access_token: 'abc', expires_in: 3600 } },
      { status: 401, text: 'unauthorized' },
    ]);
    const t = createGraphTransport({
      entraTenantId: 'e1',
      sender: 'noreply@acme.test',
      ...ENV,
      fetchImpl: fetchFn as unknown as typeof fetch,
    });
    await expect(
      t.send({
        from: 'noreply@acme.test',
        to: 'a@example.com',
        subject: 's',
        html: 'x',
        text: 'x',
      }),
    ).rejects.toMatchObject({
      classification: 'permanent',
      code: 'GRAPH_401',
    });
  });

  it('classifies 429 as transient', async () => {
    const fetchFn = mockFetch([
      { status: 200, body: { access_token: 'abc', expires_in: 3600 } },
      { status: 429, text: 'throttled', headers: { 'retry-after': '12' } },
    ]);
    const t = createGraphTransport({
      entraTenantId: 'e1',
      sender: 'noreply@acme.test',
      ...ENV,
      fetchImpl: fetchFn as unknown as typeof fetch,
    });
    await expect(
      t.send({
        from: 'noreply@acme.test',
        to: 'a@example.com',
        subject: 's',
        html: 'x',
        text: 'x',
      }),
    ).rejects.toMatchObject({
      classification: 'transient',
      code: 'GRAPH_429',
    });
  });

  it('classifies 503 as transient', async () => {
    const fetchFn = mockFetch([
      { status: 200, body: { access_token: 'abc', expires_in: 3600 } },
      { status: 503, text: 'unavailable' },
    ]);
    const t = createGraphTransport({
      entraTenantId: 'e1',
      sender: 'noreply@acme.test',
      ...ENV,
      fetchImpl: fetchFn as unknown as typeof fetch,
    });
    await expect(
      t.send({
        from: 'noreply@acme.test',
        to: 'a@example.com',
        subject: 's',
        html: 'x',
        text: 'x',
      }),
    ).rejects.toMatchObject({
      classification: 'transient',
    });
  });
});
