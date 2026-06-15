import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { addCases } from '../../src/backend/domain/add-cases.ts';
import { createDataset } from '../../src/backend/domain/create-dataset.ts';
import { createRun } from '../../src/backend/domain/create-run.ts';
import { getRun } from '../../src/backend/domain/get-run.ts';
import { listRunResults } from '../../src/backend/domain/list-run-results.ts';
import { runEvaluation } from '../../src/backend/jobs/run-evaluation.ts';
import { ALL_EVALUATION_PERMS, buildSession, readEvents } from '../helpers.ts';

// Deterministic offline raw-call seam — no real LLM.
const fakeRawCall = async () => ({
  output: 'The primary colors are red, green, and blue.',
  latencyMs: 3,
});

const run = <T>(fn: (ctx: { pool: import('pg').Pool }) => Promise<T>) =>
  withTestDb(
    {
      templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
    },
    async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        return await fn({ pool });
      } finally {
        resetCoreDb();
        await closePools();
      }
    },
  );

describe('runEvaluation', () => {
  it('executes cases, persists case_results + scores + summary, completes, emits completed', async () => {
    await run(async ({ pool }) => {
      const session = buildSession({ permissions: ALL_EVALUATION_PERMS });
      const { datasetId } = await createDataset({ name: 'DS', session });
      await addCases({
        datasetId,
        cases: [{ input: 'List the primary colors.' }, { input: 'Name three primary colors.' }],
        session,
      });
      const { runId } = await createRun({
        datasetId,
        targetModel: 'mock/test',
        scorerIds: ['completeness'],
        session,
      });

      await runEvaluation({ runId, tenantId: session.tenant_id }, { rawCallFn: fakeRawCall });

      const runRow = await getRun({ runId, session });
      expect(runRow.status).toBe('completed');
      expect(runRow.started_at).not.toBeNull();
      expect(runRow.finished_at).not.toBeNull();
      const summary = runRow.summary as {
        cases: { total: number; ok: number; error: number };
        scorers: Record<string, { avg: number; n: number }>;
      };
      expect(summary.cases).toEqual({ total: 2, ok: 2, error: 0 });
      expect(summary.scorers.completeness?.n).toBe(2);
      expect(typeof summary.scorers.completeness?.avg).toBe('number');

      const results = await listRunResults({ runId, session });
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.status === 'ok')).toBe(true);
      expect(results.every((r) => r.scores.length === 1)).toBe(true);

      const completed = await readEvents(pool, session.tenant_id, 'evaluation.run.completed');
      expect(completed).toHaveLength(1);
      expect(completed[0]?.payload.run_id).toBe(runId);
    });
  });

  it('is idempotent — a second invocation does not duplicate case_results', async () => {
    await run(async ({ pool }) => {
      const session = buildSession({ permissions: ALL_EVALUATION_PERMS });
      const { datasetId } = await createDataset({ name: 'DS', session });
      await addCases({ datasetId, cases: [{ input: 'List the primary colors.' }], session });
      const { runId } = await createRun({
        datasetId,
        targetModel: 'mock/test',
        scorerIds: ['completeness'],
        session,
      });

      await runEvaluation({ runId, tenantId: session.tenant_id }, { rawCallFn: fakeRawCall });
      await runEvaluation({ runId, tenantId: session.tenant_id }, { rawCallFn: fakeRawCall });

      const { rows } = await pool.query<{ count: string }>(
        `SELECT count(*)::int AS count FROM evaluation.case_results WHERE run_id = $1`,
        [runId],
      );
      expect(Number(rows[0]?.count)).toBe(1);
    });
  });
});
