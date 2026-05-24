import type { ContributionRegistry, SessionEnv } from '@seta/core';
import type { Hono } from 'hono';

const FRONTEND_ONLY_MODULES = ['admin'];

export function registerEnabledModulesRoute(
  app: Hono<SessionEnv>,
  reg: ContributionRegistry,
): void {
  app.get('/api/me/enabled-modules', (c) => {
    const enabled = [...Array.from(reg.collected.schemas.keys()), ...FRONTEND_ONLY_MODULES];
    return c.json({ enabled });
  });
}
