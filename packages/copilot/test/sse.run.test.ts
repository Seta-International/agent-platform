import { randomUUID } from 'node:crypto';
import type { Mastra } from '@mastra/core';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { SessionLike } from '../src/backend/routes.ts';
import { onLifecycleEvent } from '../src/backend/workflows/lifecycle-hook.ts';
import { mountRunSse } from '../src/backend/workflows/sse-run.ts';
import { withCopilotTestDb } from './test-helpers.ts';

function session(tenantId: string, userId: string, perms: string[]): SessionLike {
  return {
    tenant_id: tenantId,
    user_id: userId,
    effective_permissions: new Set(perms),
    role_summary: { roles: [], cross_tenant_read: false },
  };
}

async function seed(
  pool: import('pg').Pool,
  args: { runId: string; tenantId: string; startedBy: string },
): Promise<void> {
  await onLifecycleEvent(pool, {
    kind: 'run-started',
    runId: args.runId,
    eventSeq: 1,
    workflowId: 'copilot.x',
    tenantId: args.tenantId,
    startedBy: args.startedBy,
    startedVia: 'event',
    parentThreadId: null,
    parentRunId: null,
    sourceEventId: null,
    inputSummary: {},
    occurredAt: new Date(),
  });
}

async function readUntil(
  res: Response,
  predicate: (s: string) => boolean,
  timeoutMs = 3000,
): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let acc = '';
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      acc += decoder.decode(value, { stream: true });
      if (predicate(acc)) return acc;
    }
    throw new Error(`SSE timeout — collected:\n${acc}`);
  } finally {
    await reader.cancel().catch(() => {});
  }
}

function makeMastra(watch: ReturnType<typeof vi.fn>): Mastra {
  return {
    getWorkflow: () => ({
      createRun: async () => ({ watch }),
    }),
  } as unknown as Mastra;
}

describe('mountRunSse', () => {
  it('returns 401 when no session resolves', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const mastra = makeMastra(vi.fn());
      const app = new Hono();
      mountRunSse(app, { pool, mastra, resolveSession: () => null });
      const res = await app.request(`/api/copilot/workflows/runs/${randomUUID()}/stream`);
      expect(res.status).toBe(401);
    });
  });

  it('returns 404 when run is invisible to the caller', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const me = session(randomUUID(), randomUUID(), ['copilot.workflow.run.read.self']);
      const runId = randomUUID();
      await seed(pool, { runId, tenantId: randomUUID(), startedBy: randomUUID() });
      const mastra = makeMastra(vi.fn());
      const app = new Hono();
      mountRunSse(app, { pool, mastra, resolveSession: () => me });
      const res = await app.request(`/api/copilot/workflows/runs/${runId}/stream`);
      expect(res.status).toBe(404);
    });
  });

  it('proxies Mastra run.watch events to SSE', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const me = session(randomUUID(), randomUUID(), ['copilot.workflow.run.read.self']);
      const runId = randomUUID();
      await seed(pool, { runId, tenantId: me.tenant_id, startedBy: me.user_id });

      let watcher: ((evt: unknown) => Promise<void> | void) | null = null;
      const watch = vi.fn((cb: (evt: unknown) => Promise<void> | void) => {
        watcher = cb;
        return () => {
          watcher = null;
        };
      });
      const mastra = makeMastra(watch);

      const app = new Hono();
      mountRunSse(app, { pool, mastra, resolveSession: () => me });

      const res = await app.request(`/api/copilot/workflows/runs/${runId}/stream`, {
        headers: { Accept: 'text/event-stream' },
      });
      expect(res.status).toBe(200);

      const firePromise = (async () => {
        for (let i = 0; i < 30 && !watcher; i++) await new Promise((r) => setTimeout(r, 10));
        if (!watcher) throw new Error('watcher never registered');
        // capture in typed local to satisfy TS control-flow narrowing across async boundary
        const call = watcher as (evt: unknown) => Promise<void> | void;
        await call({ type: 'workflow.step.start', payload: { stepId: 'noop' } });
      })();

      const text = await readUntil(res, (acc) => acc.includes('event: workflow.step.start'));
      await firePromise;
      expect(text).toContain('workflow.step.start');
      expect(text).toContain('noop');
    });
  });
});
