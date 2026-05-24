import { describe, expect, it } from 'vitest';
import { buildHonoApp, createContributionRegistry } from '../../src/index.ts';

describe('request-id middleware', () => {
  it('echoes inbound x-request-id in the response header', async () => {
    const app = buildHonoApp(createContributionRegistry());
    const res = await app.request('/health/live', {
      headers: { 'x-request-id': 'req-test-123' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id')).toBe('req-test-123');
  });

  it('mints a ULID-shaped request-id when absent', async () => {
    const app = buildHonoApp(createContributionRegistry());
    const res = await app.request('/health/live');
    expect(res.status).toBe(200);
    const id = res.headers.get('x-request-id');
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });
});
