import type { MastraScorer } from '@mastra/core/evals';
import type {
  AgentResult,
  SpecializedAgentRunCtx,
  SpecializedAgentSpec,
  SubStepEvent,
} from '@seta/agent-sdk';
import type { EvalCase } from './dataset.ts';

export interface SpecScorerEntry {
  scorer: MastraScorer;
  /** Minimum passing score, default 1. */
  threshold?: number;
  /** Whether falling below threshold fails the verdict, default true. */
  gate?: boolean;
}

export interface RunSpecEvalsConfig<I, O> {
  target: SpecializedAgentSpec<I, O>;
  data: EvalCase<I>[];
  scorers: SpecScorerEntry[];
}

export interface CaseScore {
  caseName: string;
  scorerId: string;
  score: number;
  reason?: string;
  passed: boolean;
  gate: boolean;
}

export interface RunSpecEvalsResult {
  verdict: 'passed' | 'failed';
  /** Mean score per scorer id across all cases. */
  scores: Record<string, number>;
  cases: CaseScore[];
  summary: { totalCases: number; totalScores: number };
}

export async function runSpecEvals<I, O>(
  cfg: RunSpecEvalsConfig<I, O>,
): Promise<RunSpecEvalsResult> {
  // No LLM in Phase 1 (fake deps), so parallel runs are safe and fast.
  const perCase = await Promise.all(
    cfg.data.map(async (c): Promise<CaseScore[]> => {
      const trajectory: SubStepEvent[] = [];
      const ctx: SpecializedAgentRunCtx = {
        tenantId: c.actor.tenantId,
        actorUserId: c.actor.userId,
        effectivePermissions: c.actor.permissions ? new Set(c.actor.permissions) : undefined,
        onEvent: (e) => trajectory.push(e),
      };
      const result = (await cfg.target.run(c.input, ctx)) as AgentResult<O>;

      return Promise.all(
        cfg.scorers.map(async (entry): Promise<CaseScore> => {
          const run = await entry.scorer.run({
            input: c.input as never,
            output: result as never,
            groundTruth: c.groundTruth as never,
          });
          const score = (run as { score: number }).score;
          const threshold = entry.threshold ?? 1;
          const gate = entry.gate ?? true;
          return {
            caseName: c.name,
            scorerId: entry.scorer.id,
            score,
            reason: (run as { reason?: string }).reason,
            passed: score >= threshold,
            gate,
          };
        }),
      );
    }),
  );

  const cases = perCase.flat();
  const byScorer = new Map<string, number[]>();
  for (const s of cases) {
    const arr = byScorer.get(s.scorerId) ?? [];
    arr.push(s.score);
    byScorer.set(s.scorerId, arr);
  }
  const scores: Record<string, number> = {};
  for (const [id, arr] of byScorer) {
    scores[id] = arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  const verdict = cases.every((s) => !s.gate || s.passed) ? 'passed' : 'failed';
  return {
    verdict,
    scores,
    cases,
    summary: { totalCases: cfg.data.length, totalScores: cases.length },
  };
}
