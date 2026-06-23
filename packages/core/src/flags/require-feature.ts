// packages/core/src/flags/require-feature.ts
import type { MiddlewareHandler } from 'hono';
import type { SessionEnv } from '../middleware/session.ts';
import { isFeatureEnabled } from './is-feature-enabled.ts';

export const requireFeature =
  (key: string): MiddlewareHandler<SessionEnv> =>
  async (c, next) => {
    if (!isFeatureEnabled(c.get('user'), key)) return c.json({ error: 'not_found' }, 404);
    await next();
  };
