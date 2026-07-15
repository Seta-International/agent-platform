import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../db/schema/index.ts';
import { coreAgentEvalRun, coreAgentEvalScore } from '../db/schema/index.ts';

export interface EvalRunInput {
  gitSha: string;
  harnessVersion: string;
  modelTier: string;
  trigger: 'nightly' | 'manual';
  judgeTokensTotal?: number;
  finishedAt?: Date;
}

export interface EvalScoreInput {
  specialistId: string;
  scorerId: string;
  layer: string;
  score: number;
  threshold: number;
  passed: boolean;
  reason?: string;
}

/** Insert a run + its scores in one transaction. Caller injects the db handle. */
export async function writeEvalRun(
  db: NodePgDatabase<typeof schema>,
  run: EvalRunInput,
  scores: EvalScoreInput[],
): Promise<{ runId: string }> {
  return db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(coreAgentEvalRun)
      .values({
        git_sha: run.gitSha,
        harness_version: run.harnessVersion,
        model_tier: run.modelTier,
        trigger: run.trigger,
        judge_tokens_total: run.judgeTokensTotal ?? 0,
        finished_at: run.finishedAt ?? null,
      })
      .returning({ id: coreAgentEvalRun.id });
    if (!inserted) {
      throw new Error('writeEvalRun: insert into agent_eval_run returned no row');
    }
    const runId = inserted.id;

    if (scores.length > 0) {
      await tx.insert(coreAgentEvalScore).values(
        scores.map((s) => ({
          run_id: runId,
          specialist_id: s.specialistId,
          scorer_id: s.scorerId,
          layer: s.layer,
          score: s.score,
          threshold: s.threshold,
          passed: s.passed,
          reason: s.reason ?? null,
        })),
      );
    }
    return { runId };
  });
}
