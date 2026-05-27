import { Mastra } from '@mastra/core';
import { RequestContext } from '@mastra/core/request-context';
import { createStep } from '@mastra/core/workflows';
import { createWorkflow } from '@mastra/core/workflows/evented';
import { PostgresStore } from '@mastra/pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { withCopilotTestDb } from '../helpers.ts';

// Regression guard for the projection-vs-engine contract.
//
// Copilot's lifecycle hook (runtime.ts) subscribes to the `workflows` pubsub
// topic and projects events into copilot.workflow_runs / workflow_approvals.
// Only Mastra's EVENTED engine publishes workflow.start / workflow.suspend /
// workflow.end on that topic. The default engine in `@mastra/core/workflows`
// runs inline and emits per-run watch events on `workflow.events.v2.<runId>`
// instead — invisible to our subscriber. If a module ever reverts a workflow
// to the default `createWorkflow`, suspended runs would silently get stuck as
// `running` in the projection with no approval row. This test fails the build
// before that can ship.
describe('workflow engine selection (evented vs default)', () => {
  // Snapshot the prototype's publish so cross-test patches don't leak.
  let originalProtoPublish:
    | ((topic: string, event: { type?: string; runId?: string }) => Promise<void>)
    | null = null;
  let protoRef: {
    publish: (t: string, e: { type?: string; runId?: string }) => Promise<void>;
  } | null = null;

  beforeEach(() => {
    originalProtoPublish = null;
    protoRef = null;
  });
  afterEach(() => {
    if (protoRef && originalProtoPublish) {
      protoRef.publish = originalProtoPublish;
    }
  });

  it('evented createWorkflow publishes workflow.start to the "workflows" topic on run.start()', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const storage = new PostgresStore({
        id: 'diag-copilot-store',
        schemaName: 'copilot',
        pool,
      });
      const mastra = new Mastra({ storage, logger: false });
      await storage.init();

      const publishes: Array<{ topic: string; type?: string }> = [];
      protoRef = Object.getPrototypeOf(mastra.pubsub) as typeof protoRef;
      originalProtoPublish = protoRef!.publish;
      protoRef!.publish = async function (topic, event) {
        publishes.push({ topic, type: event?.type });
        return originalProtoPublish!.call(this, topic, event);
      };

      const step = createStep({
        id: 'diag.noop',
        inputSchema: z.object({}),
        outputSchema: z.object({ ok: z.boolean() }),
        execute: async () => ({ ok: true }),
      });
      const wf = createWorkflow({
        id: 'diag.noop-workflow',
        inputSchema: z.object({}),
        outputSchema: z.object({ ok: z.boolean() }),
      })
        .then(step)
        .commit();
      mastra.addWorkflow(wf as never);
      void mastra.startWorkers();
      await new Promise((r) => setTimeout(r, 50));

      const requestContext = new RequestContext();
      requestContext.set('actor', { type: 'user' as const, user_id: 'u1' });
      requestContext.set('tenant_id', 't1');

      const run = await wf.createRun();
      void run.start({ inputData: {}, requestContext } as never);
      await new Promise((r) => setTimeout(r, 500));

      const startPublish = publishes.find(
        (p) => p.topic === 'workflows' && p.type === 'workflow.start',
      );
      expect(startPublish, `publishes seen: ${JSON.stringify(publishes)}`).toBeDefined();
    });
  }, 30000);
});
