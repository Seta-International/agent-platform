import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { requireFeature } from '../../src/flags/require-feature.ts';
import type { SessionEnv } from '../../src/middleware/session.ts';

function appWithFeatures(features: string[]) {
  const app = new Hono<SessionEnv>();
  app.use('*', async (c, next) => {
    c.set('user', { features: new Set(features) } as never);
    await next();
  });
  app.use('/api/demo/*', requireFeature('demo'));
  app.get('/api/demo/v1/ping', (c) => c.json({ ok: true }));
  return app;
}

describe('requireFeature', () => {
  it('passes through when the flag is enabled', async () => {
    const res = await appWithFeatures(['demo']).request('/api/demo/v1/ping');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('404s when the flag is disabled', async () => {
    const res = await appWithFeatures([]).request('/api/demo/v1/ping');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });
});
