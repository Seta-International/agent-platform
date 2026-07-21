import { resolveModel } from '@seta/agent';
import {
  detectRegressions,
  type RegressionReport,
  readRegressionInputs,
  writeEvalRun,
} from '@seta/core/agent-eval';
import { coreDb } from '@seta/core/db';
import { plannerEvalManifest } from '@seta/planner/evals';
import type { EvalManifest } from '@seta/shared-agent-evals';
import {
  answerRelevancyScorer,
  EVALS_HARNESS_VERSION,
  faithfulnessScorer,
  hallucinationScorer,
  type JudgeModel,
  type RunQualityEvalsResult,
  runQualityEvals,
  toxicityScorer,
} from '@seta/shared-agent-evals';

// Every module that owns quality suites appends its manifest here.
const MANIFESTS: EvalManifest[] = [plannerEvalManifest];

export const REGRESSION_WINDOW = 5;
export const REGRESSION_DELTA = 0.1;
export const REGRESSION_MIN_BASELINE = 2;

/** Pure: render the advisory regression block for the nightly job summary. */
export function formatRegressionReport(report: RegressionReport, window: number): string {
  const lines: string[] = [
    '',
    `## Quality regression vs baseline (last ${window} runs, drop > ${REGRESSION_DELTA})`,
  ];
  if (report.regressions.length === 0) {
    lines.push('No regressions vs the baseline.');
  } else {
    lines.push(
      '| specialist | scorer | baseline | current | drop |',
      '| --- | --- | --- | --- | --- |',
    );
    for (const r of report.regressions) {
      lines.push(
        `| ${r.specialistId} | ${r.scorerId} | ${r.baseline.toFixed(2)} | ${r.current.toFixed(2)} | -${r.drop.toFixed(2)} |`,
      );
    }
  }
  if (report.insufficient.length > 0) {
    const keys = report.insufficient.map((k) => `${k.specialistId}/${k.scorerId}`).join(', ');
    lines.push(
      '',
      `_Insufficient baseline (< ${REGRESSION_MIN_BASELINE} prior runs), not evaluated: ${keys}._`,
    );
  }
  return lines.join('\n');
}

export interface SummaryRow {
  specId: string;
  scorerId: string;
  mean: number;
}

/** The judged quality scorers, ordered. Pure (no model calls) so composition is
 *  unit-testable. `hallucination` receives grounding context via the wrapper. */
export function buildQualityScorers(judgeModel: JudgeModel) {
  return [
    { scorer: answerRelevancyScorer({ model: judgeModel }) },
    { scorer: faithfulnessScorer({ model: judgeModel }) },
    { scorer: hallucinationScorer({ model: judgeModel }) },
    { scorer: toxicityScorer({ model: judgeModel }) },
  ];
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
}): Promise<{ runId?: string; results: RunQualityEvalsResult[]; regression?: RegressionReport }> {
  // Captured before the manifest loop / generation runs so the persisted
  // `started_at` reflects real wall-clock start, not INSERT time.
  const startedAt = new Date();
  // Same resolve reused for gen + judge (temp 0 configured in AGENT_MODELS); `entry.tier`
  // is the *actual* resolved tier, which may differ from the 'fast' hint if no fast-tier
  // model is configured (resolveModel falls back to the catalog's first entry).
  const { model: genModel, entry } = resolveModel('auto', { tierHint: 'fast' });
  const judgeModel = genModel;
  const scorers = buildQualityScorers(judgeModel);

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
        modelTier: entry.tier,
        trigger: opts.trigger,
        startedAt,
        // judge_tokens_total: reserved, not populated yet — see store.ts. The
        // prebuilt judge scorers' run() result doesn't expose token usage, so
        // there's nothing real to thread through here until Phase 2B.
        finishedAt: new Date(),
      },
      scoreRows,
    );
    runId = written.runId;
  }

  let regression: RegressionReport | undefined;
  if (runId) {
    const inputs = await readRegressionInputs(coreDb(), {
      currentRunId: runId,
      window: REGRESSION_WINDOW,
    });
    regression = detectRegressions(inputs.current, inputs.baselineMeans, {
      delta: REGRESSION_DELTA,
      minBaselineRuns: REGRESSION_MIN_BASELINE,
    });
  }
  return { runId, results, regression };
}
