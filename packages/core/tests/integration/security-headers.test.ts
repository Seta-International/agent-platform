import { describe, expect, it } from 'vitest';
import { buildHonoApp, createContributionRegistry } from '../../src/index.ts';

describe('security headers middleware', () => {
  it('sets nosniff, frame, referrer, and CSP on a 200 response', async () => {
    const app = buildHonoApp(createContributionRegistry());
    const res = await app.request('/health/live');
    expect(res.status).toBe(200);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('content-security-policy')).toMatch(/frame-ancestors 'none'/);
  });
});

describe('CORS middleware', () => {
  it('allows configured origin and rejects others', async () => {
    const app = buildHonoApp(createContributionRegistry(), {
      corsOrigins: ['http://localhost:5173'],
    });

    const ok = await app.request('/health/live', {
      headers: { origin: 'http://localhost:5173' },
    });
    expect(ok.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');

    const denied = await app.request('/health/live', {
      headers: { origin: 'https://attacker.example' },
    });
    // CORS middleware returns the response but does not echo allow-origin for
    // disallowed origins — the browser then refuses to surface the body.
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('rejects a credentialed preflight from an unlisted origin', async () => {
    const app = buildHonoApp(createContributionRegistry(), {
      corsOrigins: ['http://localhost:5173'],
    });
    const res = await app.request('/health/live', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://attacker.example',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('skips CORS entirely when no origins are configured (same-origin only)', async () => {
    const app = buildHonoApp(createContributionRegistry(), { corsOrigins: [] });
    const res = await app.request('/health/live', {
      headers: { origin: 'http://localhost:5173' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});
