import type { Context, Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { Pool } from 'pg';
import type { SessionLike } from '../routes.ts';
import { verifySseToken } from './auth-token.ts';

export type WorkflowRunScope = 'self' | 'group' | 'tenant' | 'instance';

export interface MountInboxSseDeps {
  pool: Pool;
  resolveSession?: (c: Context) => SessionLike | null;
}

const SCOPE_PERMISSIONS: Record<WorkflowRunScope, string> = {
  self: 'copilot.workflow.run.read.self',
  group: 'copilot.workflow.run.read.tenant',
  tenant: 'copilot.workflow.run.read.tenant',
  instance: 'copilot.workflow.run.read.instance',
};

export function mountInboxSse(app: Hono, deps: MountInboxSseDeps): void {
  const resolveSession = deps.resolveSession ?? defaultSessionResolver;

  app.get('/api/copilot/workflows/runs/stream', async (c) => {
    const sess = resolveSession(c);
    if (!sess) return c.text('unauthorized', 401);

    const url = new URL(c.req.url);
    const scope = (url.searchParams.get('scope') ?? 'self') as WorkflowRunScope;
    const required = SCOPE_PERMISSIONS[scope];
    if (!required) return c.text('invalid_scope', 400);
    if (!sess.effective_permissions.has(required)) return c.text('forbidden', 403);

    return streamSSE(c, async (stream) => {
      const client = await deps.pool.connect();
      const onNotification = makeNotificationHandler(stream, sess, scope);
      client.on('notification', onNotification);
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      try {
        await client.query('LISTEN copilot_workflow_runs');
        await stream.writeSSE({ event: 'connected', data: '{}' });
        heartbeat = setInterval(() => {
          stream.writeSSE({ event: 'heartbeat', data: '{}' }).catch(() => {});
        }, 30_000);

        await new Promise<void>((resolve) => {
          stream.onAbort(() => resolve());
        });
      } finally {
        if (heartbeat) clearInterval(heartbeat);
        client.off('notification', onNotification);
        try {
          await client.query('UNLISTEN copilot_workflow_runs');
        } catch {
          // connection may already be torn down at disconnect
        }
        client.release();
      }
    });
  });
}

type SseHandle = { writeSSE: (m: { event: string; data: string; id?: string }) => Promise<void> };

function makeNotificationHandler(
  stream: SseHandle,
  sess: SessionLike,
  scope: WorkflowRunScope,
): (n: { channel: string; payload?: string }) => void {
  return (n) => {
    if (n.channel !== 'copilot_workflow_runs' || !n.payload) return;
    let parsed: { runId: string; kind: string; tenantId: string };
    try {
      parsed = JSON.parse(n.payload) as { runId: string; kind: string; tenantId: string };
    } catch {
      // malformed payload from pg_notify — drop silently
      return;
    }
    if (scope !== 'instance' && parsed.tenantId !== sess.tenant_id) return;
    const eventName = parsed.kind === 'run-started' ? 'run.created' : 'run.status_changed';
    void stream.writeSSE({
      event: eventName,
      data: JSON.stringify({
        runId: parsed.runId,
        kind: parsed.kind,
        tenantId: parsed.tenantId,
      }),
      id: String(Date.now()),
    });
  };
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
