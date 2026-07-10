import { randomUUID } from 'node:crypto';
import { RequestContext } from '@mastra/core/request-context';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { buildMastra } from '../../src/backend/runtime.ts';
import { withAgentTestDb } from '../helpers.ts';

type Row = Record<string, unknown>;

// The lifecycle hooks land asynchronously off the pubsub topic, so sleeping a fixed 50ms
// only chooses where the flake threshold sits — on CI's shared runner the row had not
// landed yet. Poll for the state the assertion needs.
async function pollRow(
  pool: Pool,
  sql: string,
  params: unknown[],
  ready: (row: Row) => boolean,
  what: string,
): Promise<Row> {
  const deadline = Date.now() + 10_000;
  let last: Row | undefined;
  do {
    last = (await pool.query(sql, params)).rows[0] as Row | undefined;
    if (last && ready(last)) return last;
    await new Promise((r) => setTimeout(r, 25));
  } while (Date.now() < deadline);
  throw new Error(`${what} never settled; last row: ${JSON.stringify(last ?? null)}`);
}

const RUN_SQL = `SELECT workflow_id, tenant_id, started_by, started_via, status, duration_ms, suspend_reason
                   FROM agent.workflow_runs WHERE run_id = $1`;

const waitForRunStatus = (pool: Pool, runId: string, status: string): Promise<Row> =>
  pollRow(pool, RUN_SQL, [runId], (r) => r.status === status, `workflow_runs(${runId}).${status}`);

// Build a requestContext.toJSON()-shaped payload from the codebase convention:
// `actor: { user_id }` + `tenant_id`. Goes through a real RequestContext so the
// test locks in the actual wire format that Mastra's execution engine emits.
function rcPayload(args: { tenantId: string; startedBy: string }): Record<string, unknown> {
  const rc = new RequestContext();
  rc.set('actor', { type: 'user', user_id: args.startedBy });
  rc.set('tenant_id', args.tenantId);
  return rc.toJSON();
}

describe('lifecycle hook wiring', () => {
  it('publishing workflow.start on the global pubsub writes a workflow_runs row', async () => {
    await withAgentTestDb(async ({ pool, databaseUrl }) => {
      const mastra = buildMastra({ pool, databaseUrl });
      await mastra.getStorage()!.init();

      const runId = randomUUID();
      const tenantId = randomUUID();
      const startedBy = randomUUID();

      await mastra.pubsub.publish('workflows', {
        type: 'workflow.start',
        runId,
        data: {
          workflowId: 'agent.test.noop',
          runId,
          requestContext: rcPayload({ tenantId, startedBy }),
          prevResult: { status: 'success', output: { taskTitle: 'demo' } },
        },
      });

      const row = await waitForRunStatus(pool, runId, 'running');
      expect(row.workflow_id).toBe('agent.test.noop');
      expect(row.tenant_id).toBe(tenantId);
      expect(row.started_by).toBe(startedBy);
      expect(row.started_via).toBe('event');
    });
  });

  it('publishing workflow.end on workflows-finish marks the run completed', async () => {
    await withAgentTestDb(async ({ pool, databaseUrl }) => {
      const mastra = buildMastra({ pool, databaseUrl });
      await mastra.getStorage()!.init();

      const runId = randomUUID();
      const tenantId = randomUUID();
      const startedBy = randomUUID();

      await mastra.pubsub.publish('workflows', {
        type: 'workflow.start',
        runId,
        data: {
          workflowId: 'agent.test.noop',
          runId,
          requestContext: rcPayload({ tenantId, startedBy }),
          prevResult: { status: 'success', output: {} },
        },
      });
      await waitForRunStatus(pool, runId, 'running');

      await mastra.pubsub.publish('workflows-finish', {
        type: 'workflow.end',
        runId,
        data: {
          workflowId: 'agent.test.noop',
          runId,
          durationMs: 123,
          state: { result: { output: { ok: true } } },
        },
      });

      const row = await waitForRunStatus(pool, runId, 'success');
      expect(row.duration_ms).toBe(123);
    });
  });

  it('handles workflow.suspend when requestContext is a live class instance (not toJSON)', async () => {
    // Mastra's evented engine spreads the live RequestContext into workflow.suspend
    // event data (see workflow-event-processor:1607), unlike workflow.start which
    // calls .toJSON(). The adapter must read both shapes.
    await withAgentTestDb(async ({ pool, databaseUrl }) => {
      const mastra = buildMastra({ pool, databaseUrl });
      await mastra.getStorage()!.init();

      const runId = randomUUID();
      const tenantId = randomUUID();
      const startedBy = randomUUID();

      await mastra.pubsub.publish('workflows', {
        type: 'workflow.start',
        runId,
        data: {
          workflowId: 'agent.test.noop',
          runId,
          requestContext: rcPayload({ tenantId, startedBy }),
          prevResult: { status: 'success', output: {} },
        },
      });
      await waitForRunStatus(pool, runId, 'running');

      // Now publish workflow.suspend with the live RequestContext object — the
      // exact shape Mastra produces internally for evented suspend.
      const liveRc = new RequestContext();
      liveRc.set('actor', { type: 'user', user_id: startedBy });
      liveRc.set('tenant_id', tenantId);
      await mastra.pubsub.publish('workflows', {
        type: 'workflow.suspend',
        runId,
        data: {
          workflowId: 'agent.test.noop',
          requestContext: liveRc,
          stepId: 'await-approval',
          suspendReason: 'hitl_pending',
          proposedPayload: { task: 'demo' },
          approverUserId: startedBy,
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
      });
      const run = await waitForRunStatus(pool, runId, 'paused');
      expect(run.suspend_reason).toBe('hitl_pending');

      const approval = await pollRow(
        pool,
        `SELECT step_id, status, approver_user_id FROM agent.workflow_approvals WHERE run_id = $1`,
        [runId],
        () => true,
        `workflow_approvals(${runId})`,
      );
      expect(approval.step_id).toBe('await-approval');
      expect(approval.status).toBe('pending');
      expect(approval.approver_user_id).toBe(startedBy);
    });
  });

  it('ignores workflow.step.* events on the workflows topic', async () => {
    await withAgentTestDb(async ({ pool, databaseUrl }) => {
      const mastra = buildMastra({ pool, databaseUrl });
      await mastra.getStorage()!.init();
      const runId = randomUUID();
      await mastra.pubsub.publish('workflows', {
        type: 'workflow.step.run',
        runId,
        data: { workflowId: 'agent.x' },
      });
      // A negative assertion can't be polled for — there is no state to wait on. The sleep
      // just gives a handler that shouldn't fire the chance to; a slow runner only makes
      // this pass more easily, never flake.
      await new Promise((r) => setTimeout(r, 50));
      const r = await pool.query(
        `SELECT count(*)::int AS n FROM agent.workflow_runs WHERE run_id = $1`,
        [runId],
      );
      expect(r.rows[0]!.n).toBe(0);
    });
  });
});
