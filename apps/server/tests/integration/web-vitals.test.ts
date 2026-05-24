import type { SessionEnv } from '@seta/core';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { registerObservabilityRoutes } from '../../src/routes/observability.ts';

function buildApp(): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  registerObservabilityRoutes(app);
  return app;
}

describe('POST /api/observability/v1/web-vitals', () => {
  it('accepts a valid CWV payload and returns 204', async () => {
    const app = buildApp();
    const res = await app.request('/api/observability/v1/web-vitals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'LCP',
        value: 1234.5,
        id: 'v3-1',
        delta: 1234.5,
        navigationType: 'navigate',
      }),
    });
    expect(res.status).toBe(204);
  });

  it('rejects an invalid payload with 400', async () => {
    const app = buildApp();
    const res = await app.request('/api/observability/v1/web-vitals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'NOT_A_VITAL', value: 'oops' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects a non-JSON body with 400', async () => {
    const app = buildApp();
    const res = await app.request('/api/observability/v1/web-vitals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    });
    expect(res.status).toBe(400);
  });
});
