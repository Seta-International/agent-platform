import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { describe, expect, it } from 'vitest';
import { readLatestScores, readRegressionInputs } from '../../src/agent-eval/read.ts';
import { scoreKey } from '../../src/agent-eval/regression.ts';
import { writeEvalRun } from '../../src/agent-eval/store.ts';
import { withCoreTestDb } from '../helpers.ts';

// biome-ignore lint/suspicious/noExplicitAny: the test db handle type is provided by withCoreTestDb.
type Db = NodePgDatabase<any>;

// Seed one completed run with a single (taskQuery, faithfulness) score.
async function seedRun(db: Db, opts: { startedAt: Date; score: number; tier?: string }) {
  const { runId } = await writeEvalRun(
    db,
    {
      gitSha: 'sha',
      harnessVersion: 'v',
      modelTier: opts.tier ?? 'fast',
      trigger: 'nightly',
      startedAt: opts.startedAt,
      finishedAt: new Date(opts.startedAt.getTime() + 1000),
    },
    [
      {
        specialistId: 'taskQuery',
        scorerId: 'faithfulness',
        layer: 'quality',
        score: opts.score,
        threshold: 0.5,
        passed: true,
      },
    ],
  );
  return runId;
}

describe('agent-eval read model', () => {
  it('readLatestScores returns the most recent completed run rows + finished_at + model tier', async () => {
    await withCoreTestDb(async ({ db }) => {
      await seedRun(db, { startedAt: new Date('2026-07-10T00:00:00Z'), score: 0.8 });
      await seedRun(db, { startedAt: new Date('2026-07-12T00:00:00Z'), score: 0.6, tier: 'std' });
      const latest = await readLatestScores(db);
      expect(latest.rows).toEqual([
        {
          specialistId: 'taskQuery',
          scorerId: 'faithfulness',
          layer: 'quality',
          score: 0.6,
          modelTier: 'std',
        },
      ]);
      expect(latest.lastRunFinishedAt).toBeInstanceOf(Date);
    });
  });

  it('readRegressionInputs returns current scores + per-key mean over exactly the previous runs', async () => {
    await withCoreTestDb(async ({ db }) => {
      await seedRun(db, { startedAt: new Date('2026-07-01T00:00:00Z'), score: 0.9 });
      await seedRun(db, { startedAt: new Date('2026-07-02T00:00:00Z'), score: 0.8 });
      await seedRun(db, { startedAt: new Date('2026-07-03T00:00:00Z'), score: 0.7 });
      const currentId = await seedRun(db, {
        startedAt: new Date('2026-07-04T00:00:00Z'),
        score: 0.5,
      });
      const inputs = await readRegressionInputs(db, { currentRunId: currentId, window: 5 });
      expect(inputs.current).toEqual([
        { specialistId: 'taskQuery', scorerId: 'faithfulness', score: 0.5 },
      ]);
      const stat = inputs.baselineMeans.get(scoreKey('taskQuery', 'faithfulness'));
      expect(stat?.n).toBe(3); // three prior completed runs
      expect(stat?.mean).toBeCloseTo(0.8, 5); // (0.9+0.8+0.7)/3, current 0.5 excluded
    });
  });

  it('window caps the baseline to the N most recent prior runs', async () => {
    await withCoreTestDb(async ({ db }) => {
      for (let i = 1; i <= 6; i++) {
        await seedRun(db, { startedAt: new Date(`2026-07-0${i}T00:00:00Z`), score: i / 10 });
      }
      const currentId = await seedRun(db, {
        startedAt: new Date('2026-07-07T00:00:00Z'),
        score: 0.99,
      });
      const inputs = await readRegressionInputs(db, { currentRunId: currentId, window: 5 });
      const stat = inputs.baselineMeans.get(scoreKey('taskQuery', 'faithfulness'));
      expect(stat?.n).toBe(5); // only the 5 most recent priors (0.2..0.6), the 0.1 run excluded
      expect(stat?.mean).toBeCloseTo(0.4, 5); // (0.2+0.3+0.4+0.5+0.6)/5
    });
  });
});
