import { resolveModel } from '@seta/agent';
import { writeEvalRun } from '@seta/core/agent-eval';
import { coreDb } from '@seta/core/db';
import { plannerEvalManifest } from '@seta/planner/evals';
import type { EvalManifest } from '@seta/shared-agent-evals';
import {
  answerRelevancyScorer,
  EVALS_HARNESS_VERSION,
  faithfulnessScorer,
  type RunQualityEvalsResult,
  runQualityEvals,
  toxicityScorer,
} from '@seta/shared-agent-evals';

// Every module that owns quality suites appends its manifest here.
const MANIFESTS: EvalManifest[] = [plannerEvalManifest];

export interface SummaryRow {
  specId: string;
  scorerId: string;
  mean: number;
}

/** Pure: flatten results into printable rows (unit-tested). */
export function summarizeQualityResults(results: RunQualityEvalsResult[]): SummaryRow[] {
  return results.flatMap((r) =>
    Object.entries(r.scores).map(([scorerId, mean]) => ({ specId: r.specId, scorerId, mean })),
  );
}

export async function runEvalQuality(opts: {
  trigger: 'nightly' | 'manual';
  gitSha: string;
  persist: boolean;
}): Promise<{ runId?: string; results: RunQualityEvalsResult[] }> {
  const genModel = resolveModel('auto', { tierHint: 'fast' }).model;
  const judgeModel = resolveModel('auto', { tierHint: 'fast' }).model; // temp 0 configured in AGENT_MODELS
  const scorers = [
    { scorer: answerRelevancyScorer({ model: judgeModel }) },
    { scorer: faithfulnessScorer({ model: judgeModel }) },
    { scorer: toxicityScorer({ model: judgeModel }) },
  ];

  const results: RunQualityEvalsResult[] = [];
  for (const manifest of MANIFESTS) {
    for (const suite of manifest.suites) {
      if (!suite.buildQualitySpec) continue;
      results.push(await runQualityEvals({ suite, genModel, scorers }));
    }
  }

  let runId: string | undefined;
  if (opts.persist) {
    const scoreRows = results.flatMap((r) =>
      r.cases.map((c) => ({
        specialistId: c.specId,
        scorerId: c.scorerId,
        layer: 'quality',
        score: c.score,
        threshold: c.threshold,
        passed: c.passed,
        reason: c.reason,
      })),
    );
    const written = await writeEvalRun(
      coreDb(),
      {
        gitSha: opts.gitSha,
        harnessVersion: EVALS_HARNESS_VERSION,
        modelTier: 'fast',
        trigger: opts.trigger,
        finishedAt: new Date(),
      },
      scoreRows,
    );
    runId = written.runId;
  }
  return { runId, results };
}
