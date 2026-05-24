import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { registerErrorCapture } from './error-capture.ts';
import type { ContributionRegistry } from './registry.ts';
import { requestIdMiddleware } from './request-id.ts';
import { securityHeadersMiddleware } from './security-headers.ts';

export interface BuildHonoAppOpts {
  /**
   * Origins permitted to call the API with credentials. Empty array disables
   * the cross-origin path entirely (same-origin only). Required argument so
   * deployments must make the trust list explicit.
   */
  corsOrigins?: string[];
}

export function buildHonoApp(_reg: ContributionRegistry, opts: BuildHonoAppOpts = {}): Hono {
  const app = new Hono();
  app.use('*', requestIdMiddleware);
  const origins = opts.corsOrigins ?? [];
  if (origins.length > 0) {
    app.use(
      '*',
      cors({
        origin: origins,
        credentials: true,
        maxAge: 86400,
        allowHeaders: ['content-type', 'x-request-id'],
        allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      }),
    );
  }
  app.use('*', securityHeadersMiddleware);
  registerErrorCapture(app);
  app.get('/health/live', (c) => c.json({ ok: true }));
  return app;
}
