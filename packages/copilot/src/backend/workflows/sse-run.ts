import type { Mastra } from '@mastra/core';
import type { Context, Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { Pool } from 'pg';
import { getWorkflowRun } from '../domain/get-workflow-run.ts';
import type { SessionLike } from '../routes.ts';
import { verifySseToken } from './auth-token.ts';

export interface MountRunSseDeps {
  pool: Pool;
  mastra: Mastra;
  resolveSession?: (c: Context) => SessionLike | null;
}

export function mountRunSse(app: Hono, deps: MountRunSseDeps): void {
  const resolveSession = deps.resolveSession ?? defaultSessionResolver;

  app.get('/api/copilot/workflows/runs/:runId/stream', async (c) => {
    const runId = c.req.param('runId');
    const session = resolveSession(c);
    if (!session) return c.text('unauthorized', 401);

    const projection = await getWorkflowRun({ session, runId });
    if (!projection) return c.text('not_found', 404);

    let workflow: ReturnType<Mastra['getWorkflow']>;
    try {
      workflow = deps.mastra.getWorkflow(projection.workflowId as never);
    } catch {
      return c.text('workflow_unregistered', 410);
    }

    const run = await workflow.createRun({ runId });
    return streamSSE(c, async (stream) => {
      let unwatch: (() => void) | null = null;
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      try {
        const watchResult = run.watch(async (evt: unknown) => {
          const e = evt as { type?: string; payload?: unknown; data?: unknown };
          const eventName = typeof e?.type === 'string' ? e.type : 'message';
          const dataPayload = e?.payload ?? e?.data ?? e ?? {};
          await stream
            .writeSSE({
              event: eventName,
              data: JSON.stringify(dataPayload),
              id: String(Date.now()),
            })
            .catch(() => {});
        });
        unwatch = typeof watchResult === 'function' ? watchResult : null;

        heartbeat = setInterval(() => {
          stream.writeSSE({ event: 'heartbeat', data: '{}' }).catch(() => {});
        }, 30_000);

        await new Promise<void>((resolve) => stream.onAbort(() => resolve()));
      } finally {
        if (heartbeat) clearInterval(heartbeat);
        if (unwatch) unwatch();
      }
    });
  });
}

function defaultSessionResolver(c: Context): SessionLike | null {
  const fromCtx = c.get('session') as SessionLike | undefined;
  if (fromCtx) return fromCtx;
  const auth = c.req.header('Authorization');
  const token = auth?.replace(/^Bearer /, '');
  if (!token) return null;
  const claims = verifySseToken(token);
  if (!claims) return null;
  return {
    user_id: claims.userId,
    tenant_id: claims.tenantId,
    effective_permissions: new Set<string>(),
    role_summary: { roles: [], cross_tenant_read: false },
  };
}
