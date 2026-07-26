import { expect, it } from 'vitest';
import { USER_TUAN_ID } from '../../fixtures/golden/constants.ts';
import { preflightGolden } from '../../fixtures/golden/oracles/preflight.ts';
import { cleanGoldenDataset, seedGoldenDataset } from '../../fixtures/golden/seed.ts';
import { withAgentTestDb } from '../agent-tools-helpers.ts';

// Embeddings are produced by the OpenAI Batch API (`seed:golden:embed`), which
// does not run in a relational testcontainer — so the facts/counts/isolation
// invariants are exercised here with `checkEmbeddings: false`. The embedding
// invariants themselves are unit-tested in
// tests/unit/golden/embedding-invariants.test.ts against the pure checker.
it('passes on a clean seed and throws PREFLIGHT on fact drift', async () => {
  await withAgentTestDb(async ({ pool }) => {
    await cleanGoldenDataset(pool);
    await seedGoldenDataset(pool);

    await expect(preflightGolden(pool, { checkEmbeddings: false })).resolves.toMatchObject({
      ok: true,
    });

    // Corrupt one fact: close one of Tuan's open tasks so openTaskCount drifts 12 -> 11.
    await pool.query(
      `UPDATE planner.tasks SET progress = 'done'
         WHERE id = (
           SELECT ta.task_id FROM planner.task_assignments ta
             JOIN planner.tasks t ON t.id = ta.task_id
            WHERE ta.user_id = $1 AND t.progress <> 'done' AND t.deleted_at IS NULL
            LIMIT 1)`,
      [USER_TUAN_ID],
    );

    await expect(preflightGolden(pool, { checkEmbeddings: false })).rejects.toThrow(/PREFLIGHT/);

    await cleanGoldenDataset(pool);
  });
});
