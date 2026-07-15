import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { writeEvalRun } from '../../src/agent-eval/store.ts';
import { coreAgentEvalRun, coreAgentEvalScore } from '../../src/db/schema/index.ts';
import { withCoreTestDb } from '../helpers.ts';

describe('writeEvalRun', () => {
  it('persists a run and its scores, linked by FK', async () => {
    await withCoreTestDb(async ({ db }) => {
      const { runId } = await writeEvalRun(
        db,
        { gitSha: 'abc123', harnessVersion: 'phase-2a', modelTier: 'fast', trigger: 'manual' },
        [
          {
            specialistId: 'planner.qna.generalAnswer',
            scorerId: 'answer-relevancy',
            layer: 'quality',
            score: 0.9,
            threshold: 0.5,
            passed: true,
          },
          {
            specialistId: 'planner.qna.generalAnswer',
            scorerId: 'toxicity',
            layer: 'quality',
            score: 0.0,
            threshold: 0.5,
            passed: false,
          },
        ],
      );

      const runs = await db.select().from(coreAgentEvalRun).where(eq(coreAgentEvalRun.id, runId));
      expect(runs).toHaveLength(1);
      const scores = await db
        .select()
        .from(coreAgentEvalScore)
        .where(eq(coreAgentEvalScore.run_id, runId));
      expect(scores).toHaveLength(2);
      expect(scores.map((s) => s.scorer_id).sort()).toEqual(['answer-relevancy', 'toxicity']);
    });
  });

  it('rejects an orphan score (FK enforced)', async () => {
    await withCoreTestDb(async ({ db }) => {
      await expect(
        db.insert(coreAgentEvalScore).values({
          run_id: '00000000-0000-0000-0000-000000000000',
          specialist_id: 'x',
          scorer_id: 'y',
          layer: 'quality',
          score: 1,
          threshold: 0.5,
          passed: true,
        }),
      ).rejects.toThrow();
    });
  });
});
