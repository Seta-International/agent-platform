import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../db/schema/index.ts';
import { coreAgentEvalRun, coreAgentEvalScore } from '../db/schema/index.ts';

export interface EvalRunInput {
  gitSha: string;
  harnessVersion: string;
  modelTier: string;
  trigger: 'nightly' | 'manual';
  /** Wall-clock start of the eval run — captured by the caller BEFORE generation/judging
   * begins. Must be passed explicitly: the DB's `now()` default fires at INSERT time,
   * which is after all evals have completed, producing an inverted (or ~zero) window
   * against `finishedAt`. */
  startedAt: Date;
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
        started_at: run.startedAt,
        // Reserved: real judge token usage isn't threaded yet. The prebuilt
        // `@mastra/evals` scorers' `run()` result never surfaces token usage
        // (verified against the `@mastra/core` MastraScorer implementation —
        // `executePromptStep`/`transformToScorerResult` only carry score/reason/
        // prompt fields), so there's nothing real to sum here. Populated in a
        // later increment (Phase 2B) once a token-usage-reporting path exists;
        // until then this column is intentionally always 0, not silently wrong.
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
