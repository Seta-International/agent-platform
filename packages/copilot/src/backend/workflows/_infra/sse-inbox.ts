import type { Context, Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { Pool } from 'pg';
import type { SessionLike } from '../../types.ts';
import { verifySseToken } from './auth-token.ts';
import { CoalescingEmitter } from './coalescing-emitter.ts';

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

// Broad-scope inbox subscriptions can fire many notifications per run. Coalesce
// them into one emission per run per second so React Query invalidations don't
// thrash the client.
const COALESCE_WINDOW_MS = 1000;

interface NotificationPayload {
  runId: string;
  kind: string;
  tenantId: string;
}

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
      const coalescer = shouldCoalesce(scope)
        ? new CoalescingEmitter<NotificationPayload>({
            windowMs: COALESCE_WINDOW_MS,
            keyFn: (e) => e.runId,
            emit: (payload) => writeNotification(stream, payload),
          })
        : null;
      const onNotification = makeNotificationHandler(stream, sess, scope, coalescer);
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
        coalescer?.dispose();
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

function shouldCoalesce(scope: WorkflowRunScope): boolean {
  return scope === 'tenant' || scope === 'instance';
}

function writeNotification(stream: SseHandle, payload: NotificationPayload): Promise<void> {
  const eventName = payload.kind === 'run-started' ? 'run.created' : 'run.status_changed';
  return stream.writeSSE({
    event: eventName,
    data: JSON.stringify({
      runId: payload.runId,
      kind: payload.kind,
      tenantId: payload.tenantId,
    }),
    id: String(Date.now()),
  });
}

function makeNotificationHandler(
  stream: SseHandle,
  sess: SessionLike,
  scope: WorkflowRunScope,
  coalescer: CoalescingEmitter<NotificationPayload> | null,
): (n: { channel: string; payload?: string }) => void {
  return (n) => {
    if (n.channel !== 'copilot_workflow_runs' || !n.payload) return;
    let parsed: NotificationPayload;
    try {
      parsed = JSON.parse(n.payload) as NotificationPayload;
    } catch {
      // malformed payload from pg_notify — drop silently
      return;
    }
    if (scope !== 'instance' && parsed.tenantId !== sess.tenant_id) return;
    if (coalescer) {
      coalescer.push(parsed);
    } else {
      void writeNotification(stream, parsed);
    }
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
