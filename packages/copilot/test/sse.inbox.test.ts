import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { SessionLike } from '../src/backend/routes.ts';
import { onLifecycleEvent } from '../src/backend/workflows/lifecycle-hook.ts';
import { mountInboxSse } from '../src/backend/workflows/sse-inbox.ts';
import { withCopilotTestDb } from './test-helpers.ts';

function session(tenantId: string, userId: string, perms: string[]): SessionLike {
  return {
    tenant_id: tenantId,
    user_id: userId,
    effective_permissions: new Set(perms),
    role_summary: { roles: [], cross_tenant_read: false },
  };
}

async function readSomeSse(
  res: Response,
  predicate: (text: string) => boolean,
  timeoutMs = 5000,
): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let acc = '';

  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      reader.cancel().catch(() => {});
      reject(new Error(`SSE timeout — collected:\n${acc}`));
    }, timeoutMs);

    async function pump(): Promise<void> {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          if (predicate(acc)) {
            clearTimeout(timer);
            reader.cancel().catch(() => {});
            resolve(acc);
            return;
          }
        }
        clearTimeout(timer);
        reader.cancel().catch(() => {});
        reject(new Error(`SSE stream ended — collected:\n${acc}`));
      } catch (e) {
        clearTimeout(timer);
        // Reader cancelled by timeout — rejection already scheduled.
        if (!acc.length) reject(e);
      }
    }

    void pump();
  });
}

describe('mountInboxSse', () => {
  it('streams run.created when scope=self matches', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const me = session(tenantId, userId, ['copilot.workflow.run.read.self']);
      const app = new Hono();
      mountInboxSse(app, { pool, resolveSession: () => me });

      const res = await app.request('/api/copilot/workflows/runs/stream?scope=self', {
        headers: { Accept: 'text/event-stream' },
      });
      expect(res.status).toBe(200);

      // readSomeSse accumulates text; once 'connected' appears, fire the lifecycle event.
      // The predicate fires the event as a side effect, then continues waiting for 'run.created'.
      let firedAlready = false;
      const text = await readSomeSse(
        res,
        (acc) => {
          if (!firedAlready && acc.includes('event: connected')) {
            firedAlready = true;
            void onLifecycleEvent(pool, {
              kind: 'run-started',
              runId: randomUUID(),
              eventSeq: 1,
              workflowId: 'copilot.test',
              tenantId,
              startedBy: userId,
              startedVia: 'event',
              parentThreadId: null,
              parentRunId: null,
              sourceEventId: null,
              inputSummary: {},
              occurredAt: new Date(),
            });
          }
          return acc.includes('event: run.created');
        },
        5000,
      );
      expect(text).toContain('event: run.created');
    });
  });

  it('returns 401 when no session resolves', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const app = new Hono();
      mountInboxSse(app, { pool, resolveSession: () => null });
      const res = await app.request('/api/copilot/workflows/runs/stream?scope=self');
      expect(res.status).toBe(401);
    });
  });

  it('returns 403 when scope=tenant but caller lacks read.tenant', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const me = session(randomUUID(), randomUUID(), ['copilot.workflow.run.read.self']);
      const app = new Hono();
      mountInboxSse(app, { pool, resolveSession: () => me });
      const res = await app.request('/api/copilot/workflows/runs/stream?scope=tenant');
      expect(res.status).toBe(403);
    });
  });

  it('filters out other-tenant events at scope=self/tenant', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      const me = session(tenantId, randomUUID(), ['copilot.workflow.run.read.self']);
      const app = new Hono();
      mountInboxSse(app, { pool, resolveSession: () => me });

      const res = await app.request('/api/copilot/workflows/runs/stream?scope=self', {
        headers: { Accept: 'text/event-stream' },
      });

      let firedAlready = false;
      const text = await readSomeSse(
        res,
        (acc) => {
          if (!firedAlready && acc.includes('event: connected')) {
            firedAlready = true;
            void (async () => {
              // Other tenant — should NOT reach the stream
              await onLifecycleEvent(pool, {
                kind: 'run-started',
                runId: randomUUID(),
                eventSeq: 1,
                workflowId: 'copilot.test',
                tenantId: randomUUID(),
                startedBy: randomUUID(),
                startedVia: 'event',
                parentThreadId: null,
                parentRunId: null,
                sourceEventId: null,
                inputSummary: {},
                occurredAt: new Date(),
              });
              // My tenant — should reach
              await onLifecycleEvent(pool, {
                kind: 'run-started',
                runId: randomUUID(),
                eventSeq: 1,
                workflowId: 'copilot.test',
                tenantId,
                startedBy: me.user_id,
                startedVia: 'event',
                parentThreadId: null,
                parentRunId: null,
                sourceEventId: null,
                inputSummary: {},
                occurredAt: new Date(),
              });
            })();
          }
          return acc.includes('event: run.created');
        },
        5000,
      );
      // First arriving event must be from MY tenant — `tenantId` substring must appear
      expect(text).toContain(tenantId);
    });
  });
});
