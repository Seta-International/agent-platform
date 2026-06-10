// Thin composition root — route logic lives in ./routes/*.ts sub-files.
import type { Hono } from 'hono';
import { mountCatalogRoutes } from './routes/catalog.ts';
import { mountChatRoute } from './routes/chat.ts';
import { mountThreadRoutes } from './routes/threads.ts';
import { mountWorkflowRoutes } from './routes/workflows.ts';

export type { AgentRouteDeps, AgentRouteEnv } from './routes/_shared.ts';

export function registerAgentRoutes(
  app: Hono<import('./routes/_shared.ts').AgentRouteEnv>,
  deps: import('./routes/_shared.ts').AgentRouteDeps,
): void {
  mountChatRoute(app, deps);
  mountThreadRoutes(app, deps);
  mountCatalogRoutes(app, deps);
  mountWorkflowRoutes(app, deps);
}
