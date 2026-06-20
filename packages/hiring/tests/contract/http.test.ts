import type { RouteBuildDeps } from '@seta/core';
import { describe, expect, it } from 'vitest';
import { buildHiringRoutes } from '../../src/backend/http/index.ts';

describe('buildHiringRoutes', () => {
  it('builds a Hono app exposing the requisitions route', () => {
    const app = buildHiringRoutes({} as RouteBuildDeps);
    const paths = app.routes.map((r) => `${r.method} ${r.path}`);
    expect(paths).toContain('GET /api/hiring/v1/requisitions');
    expect(paths).toContain('POST /api/hiring/v1/requisitions');
    expect(paths.some((p) => p.includes('/openings'))).toBe(true);
  });
});
