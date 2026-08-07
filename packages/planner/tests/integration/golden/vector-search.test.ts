import { expect, it } from 'vitest';
import { TASK_BILLING_SCHEMA_ID, TENANT_ID } from '../../fixtures/golden/constants.ts';
import { embedGoldenTasks } from '../../fixtures/golden/embed-tasks.ts';
import { hasEvalModelEnv } from '../../fixtures/golden/eval-models.ts';
import { cleanGoldenDataset, seedGoldenDataset } from '../../fixtures/golden/index.ts';
import { loadGoldenCases } from '../../fixtures/golden/loader.ts';
import { runRetrievalCases } from '../../fixtures/golden/retrieval-runner.ts';
import { makeGoldenVectorSearch } from '../../fixtures/golden/vector-search.ts';
import { withAgentTestDb } from '../agent-tools-helpers.ts';

it.skipIf(!hasEvalModelEnv())(
  'ranks the grade-3 subject first for the billing-migration query',
  async () => {
    await withAgentTestDb(async ({ pool, databaseUrl }) => {
      await cleanGoldenDataset(pool);
      await seedGoldenDataset(pool);
      await embedGoldenTasks(pool, databaseUrl, [TENANT_ID]);

      const search = makeGoldenVectorSearch(databaseUrl);
      const ranked = await search('tasks about the billing migration', TENANT_ID);

      expect(ranked[0]).toBe(TASK_BILLING_SCHEMA_ID);

      await cleanGoldenDataset(pool);
    });
  },
  120_000,
);

it.skipIf(!hasEvalModelEnv())(
  'RET-001 passes the A3 retrieval policy against real pgvector search',
  async () => {
    await withAgentTestDb(async ({ pool, databaseUrl }) => {
      await cleanGoldenDataset(pool);
      await seedGoldenDataset(pool);
      await embedGoldenTasks(pool, databaseUrl, [TENANT_ID]);

      const cases = loadGoldenCases({ includeAll: true }).filter(
        (c) => c.kind === 'retrieval' && c.id === 'RET-001',
      );
      const results = await runRetrievalCases({
        cases,
        decoyIds: [],
        search: makeGoldenVectorSearch(databaseUrl),
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.policy.verdict).toBe('pass');

      await cleanGoldenDataset(pool);
    });
  },
  120_000,
);
