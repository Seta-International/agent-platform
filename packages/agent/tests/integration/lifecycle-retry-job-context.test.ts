import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { retryLifecycleEvent } from '../../src/backend/jobs/lifecycle-retry.ts';

const TENANT = '11111111-1111-1111-1111-111111111111';
const RUN = '33333333-3333-3333-3333-333333333333';

/**
 * `agent_lifecycle_retry` is the dead-letter path for Mastra lifecycle events. `wrapJob`
 * cannot scope it: the payload is a serialized `MastraLifecycleEvent`, whose tenant field is
 * `tenantId`, while wrapJob reads `tenant_id`. So it reaches this handler with **no executor
 * context at all** — which is what this test reproduces by calling it outside scoped().
 */
describe('agent_lifecycle_retry runs without an executor context', () => {
  it('opens its own maintenance() context and projects the run', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        initPools({ databaseUrl });
        try {
          // Exactly as graphile-worker hands it back: JSON, camelCase, dates as ISO strings.
          const payload = {
            kind: 'run-started',
            runId: RUN,
            eventSeq: 1,
            workflowId: 'assignment',
            tenantId: TENANT,
            occurredAt: new Date().toISOString(),
            startedBy: '22222222-2222-2222-2222-222222222222',
            startedVia: 'chat',
            parentThreadId: null,
            parentRunId: null,
            sourceEventId: null,
            inputSummary: { task_id: 'x' },
          };

          // No scoped()/maintenance() wrapper here — this is the production condition.
          await retryLifecycleEvent(payload);

          const rows = await pool.query<{ tenant_id: string; status: string }>(
            `SELECT tenant_id, status FROM agent.workflow_runs WHERE run_id = $1`,
            [RUN],
          );
          expect(rows.rows).toHaveLength(1);
          expect(rows.rows[0]?.tenant_id).toBe(TENANT);
          expect(rows.rows[0]?.status).toBe('running');
        } finally {
          await closePools();
        }
      },
    );
  });
});
