import { serve } from '@hono/node-server';
import {
  buildHonoApp,
  createContributionRegistry,
  createSessionMiddleware,
  runMigrations,
  type SessionEnv,
} from '@seta/core';
import { startDispatcher } from '@seta/core/dispatcher';
import { registerCoreContributions } from '@seta/core/register';
import { startWorkerPool } from '@seta/core/workers';
import { IdentityError, listRoleGrants } from '@seta/identity';
import { auth } from '@seta/identity/auth';
import { registerIdentityContributions } from '@seta/identity/register';
import { closePools, getPool, initPools } from '@seta/shared-db';
import type { Hono } from 'hono';
import pino from 'pino';
import { parseEnv } from './env.ts';
import { registerAdminAuditRoutes } from './routes/admin-audit.ts';
import { registerAdminUsersRoutes } from './routes/admin-users.ts';
import { registerDiscoverRoute } from './routes/discover.ts';
import { registerMeRoute } from './routes/me.ts';
import { registerProfileRoutes } from './routes/profile.ts';

const log = pino({ name: 'apps/server' });
const env = parseEnv(process.env);

initPools({ databaseUrl: env.DATABASE_URL });

const reg = createContributionRegistry();
registerCoreContributions(reg);
registerIdentityContributions(reg);

await runMigrations(reg, { pool: getPool('worker') });
log.info('migrations applied');

const dispatcher = await startDispatcher({
  pool: getPool('worker'),
  subscribers: [...reg.collected.subscribers],
});
log.info('dispatcher started');

const workers = await startWorkerPool({ pool: getPool('worker') });
log.info('workers started');

const sessionMiddleware = createSessionMiddleware({
  getSession: ({ headers }) => auth.api.getSession({ headers }),
  signOut: ({ headers }) => auth.api.signOut({ headers }).then(() => undefined),
  listRoleGrants,
});

// Cast required because buildHonoApp returns unparameterized Hono; SessionEnv is additive.
const app = buildHonoApp(reg) as unknown as Hono<SessionEnv>;

// /discover first so it matches before better-auth's wildcard catches the prefix
registerDiscoverRoute(app);

// better-auth handles all remaining /auth/* paths; must register before sessionMiddleware so its routes are public
app.on(['GET', 'POST'], '/api/identity/v1/auth/*', (c) => auth.handler(c.req.raw));

// Public routes — no session required
app.get('/health/live', (c) => c.json({ ok: true }));
app.get('/health/ready', (c) => {
  const h = dispatcher.health();
  const fresh = Date.now() - h.lastTickAt.getTime() < 30_000;
  return c.json({ ok: fresh, lastTickAt: h.lastTickAt, identity: 'wired' }, fresh ? 200 : 503);
});

// Session middleware gates everything registered after this point
app.use('*', sessionMiddleware);

// Protected routes
registerMeRoute(app);
registerProfileRoutes(app);
registerAdminUsersRoutes(app);
registerAdminAuditRoutes(app);

app.onError((err, c) => {
  if (err instanceof IdentityError) {
    const status = err.code === 'FORBIDDEN' ? 403 : err.code === 'USER_NOT_FOUND' ? 404 : 400;
    return c.json({ error: err.code, message: err.message }, status);
  }
  throw err;
});

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  log.info({ port: info.port }, 'server listening');
});

let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ signal }, 'shutdown begin');
  await new Promise<void>((r) => server.close(() => r()));
  await dispatcher.shutdown(15_000);
  await workers.shutdown();
  await closePools();
  log.info('shutdown complete');
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
