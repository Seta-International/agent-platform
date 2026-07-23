// packages/planner/tests/fixtures/golden/judge-runner.ts
//
// The advisory LLM-as-judge for golden B* metrics. Owns the B*→prebuilt-scorer
// mapping (the driver stays generic) and feeds the groundedness judges the
// agent's tool outputs as `context`. The judge model is an OpenAI model
// (resolveEvalJudgeModel / EVAL_JUDGE_MODEL), independent of the agent-under-test
// so a self-hosted agent is still judged by a capable cloud model.
//
// Only B* metrics with a prebuilt judge are wired today:
//   B2 → faithfulness · B3 → hallucination · B4 → answer-relevancy
// Others (B1 factual, B5 entity-recall, B6 retrieval-IR, B7 tone, B8 clarity)
// have no prebuilt judge yet and are left recorded-only by the driver.
import type { MastraScorer } from '@mastra/core/evals';
import {
  answerRelevancyScorer,
  faithfulnessScorer,
  hallucinationScorer,
  type JudgeModel,
} from '@seta/shared-agent-evals';
import { resolveEvalJudgeModel } from './eval-models.ts';
import type {
  AgentRunOutput,
  JudgeScorerResult,
  RunGoldenEvalParams,
} from './golden-eval-runner.ts';

interface JudgeSpec {
  make: (cfg: { model: JudgeModel }) => MastraScorer;
  threshold: number;
}

// Thresholds mirror docs/agents/planner-query/eval.config.json.
const JUDGE_MAP: Record<string, JudgeSpec> = {
  B2: { make: faithfulnessScorer, threshold: 0.8 },
  B3: { make: hallucinationScorer, threshold: 0.8 },
  B4: { make: answerRelevancyScorer, threshold: 0.6 },
};

/** Grounding context for the groundedness judges: the agent's tool outputs. */
export function judgeContext(output: AgentRunOutput): string[] {
  return output.trajectory.toolCalls
    .filter((t) => t.result !== undefined)
    .map((t) => (typeof t.result === 'string' ? t.result : JSON.stringify(t.result)));
}

/** Builds the driver's `runJudge` seam. `model` defaults to the OpenAI judge; a
 *  fake model can be injected for unit tests. */
export function makeGoldenJudge(
  opts: { model?: JudgeModel } = {},
): NonNullable<RunGoldenEvalParams['runJudge']> {
  const model = opts.model ?? resolveEvalJudgeModel().model;
  return async (_c, output, metricIds) => {
    const context = judgeContext(output);
    const runInput = { output: { result: { answer: output.answer } }, context };
    const results: Record<string, JudgeScorerResult[]> = {};
    for (const id of metricIds) {
      const spec = JUDGE_MAP[id];
      if (!spec) continue;
      const scorer = spec.make({ model });
      const run = (await scorer.run(runInput as never)) as { score: number; reason?: string };
      results[id] = [
        {
          id: scorer.id,
          score: run.score,
          threshold: spec.threshold,
          passed: run.score >= spec.threshold,
          reason: run.reason,
        },
      ];
    }
    return results;
  };
}
