import type { MastraScorer } from '@mastra/core/evals';
import type { MastraModelConfig } from '@mastra/core/llm';
import type { AgentResult, SpecializedAgentRunCtx } from '@seta/agent-sdk';
import type { EvalSuite } from './dataset.ts';
import { buildMockTools } from './tool-mock.ts';

export interface QualityScorerEntry {
  scorer: MastraScorer;
  /** Advisory only — recorded/trended, never blocks. Default 0.5. */
  threshold?: number;
}

export interface RunQualityEvalsConfig<I = unknown, O = unknown> {
  // Generic (matching RunSpecEvalsConfig<I, O>) rather than bare `EvalSuite`:
  // SpecializedAgentSpec.run's `input` parameter is contravariant, so a
  // concrete EvalSuite<I, O> is not structurally assignable to a bare
  // EvalSuite (= EvalSuite<unknown, unknown>) under strictFunctionTypes.
  // Genericizing lets each call site infer its own I/O instead of widening.
  suite: EvalSuite<I, O>;
  /** The real generation model, forced onto ctx.model per case. */
  genModel: MastraModelConfig;
  scorers: QualityScorerEntry[];
  /** Bound real-model parallelism (judge + generation cost). Default 2. */
  concurrency?: number;
}

export interface QualityCaseScore {
  caseName: string;
  specId: string;
  scorerId: string;
  score: number;
  reason?: string;
  threshold: number;
  passed: boolean;
}

export interface RunQualityEvalsResult {
  specId: string;
  /** Mean score per scorer id across quality cases. */
  scores: Record<string, number>;
  cases: QualityCaseScore[];
  totalCases: number;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  // Share one entries() iterator across the worker pool: each worker's
  // `for...of` pulls the next [index, item] pair via the iterator's own
  // internal cursor, so there's no manual index bookkeeping and no
  // `noUncheckedIndexedAccess` `T | undefined` read to assert past.
  const iterator = items.entries();
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (const [i, item] of iterator) {
      out[i] = await fn(item);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Advisory real-model quality lane: runs each `layer: 'quality'` case through
 * `suite.buildQualitySpec(mocks)` with the real generation model forced onto
 * `ctx.model`, scores the result with the injected judge scorers, and
 * aggregates a mean per scorer. Never throws on low scores — `passed` is
 * informational only, there is no gate/verdict-fail here (that stays in the
 * deterministic `runSpecEvals` lane).
 */
export async function runQualityEvals<I, O>(
  cfg: RunQualityEvalsConfig<I, O>,
): Promise<RunQualityEvalsResult> {
  const build = cfg.suite.buildQualitySpec;
  if (!build) {
    return { specId: cfg.suite.specId, scores: {}, cases: [], totalCases: 0 };
  }
  const qualityCases = cfg.suite.cases.filter((c) => c.layer === 'quality');

  const perCase = await mapWithConcurrency(
    qualityCases,
    cfg.concurrency ?? 2,
    async (c): Promise<QualityCaseScore[]> => {
      const mocks = buildMockTools(c.toolMocks ?? []);
      const spec = build(mocks);
      const ctx: SpecializedAgentRunCtx = {
        tenantId: c.actor.tenantId,
        actorUserId: c.actor.userId,
        effectivePermissions: c.actor.permissions ? new Set(c.actor.permissions) : undefined,
        model: cfg.genModel, // forces the real model via pickModel(ctx, ...)
      };
      const result: AgentResult<O> = await spec.run(c.input, ctx);

      return Promise.all(
        cfg.scorers.map(async (entry): Promise<QualityCaseScore> => {
          const run = await entry.scorer.run({
            input: c.input as never,
            output: result as never,
          });
          const score = (run as { score: number }).score;
          const threshold = entry.threshold ?? 0.5;
          return {
            caseName: c.name,
            specId: cfg.suite.specId,
            scorerId: entry.scorer.id,
            score,
            reason: (run as { reason?: string }).reason,
            threshold,
            passed: score >= threshold,
          };
        }),
      );
    },
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

  return { specId: cfg.suite.specId, scores, cases, totalCases: qualityCases.length };
}
