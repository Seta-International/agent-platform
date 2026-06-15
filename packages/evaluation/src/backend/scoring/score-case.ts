import type { MastraModelConfig } from '@mastra/core/llm';
import { SCORER_REGISTRY } from './prebuilt-registry.ts';

export interface ScoreCaseInput {
  scorerIds: string[];
  input: unknown;
  output: string;
  groundTruth?: string | null;
  judgeModel?: MastraModelConfig;
}

export interface ScoreResult {
  scorerId: string;
  score: number;
  reason?: string;
}

export async function scoreCase(args: ScoreCaseInput): Promise<ScoreResult[]> {
  const results: ScoreResult[] = [];
  for (const id of args.scorerIds) {
    const def = SCORER_REGISTRY[id];
    if (!def) continue; // unknown id — skip (createRun validates the set up front)
    const scorer = def.build({ judgeModel: args.judgeModel });
    const runInput: Record<string, unknown> = { output: args.output };
    if (def.requires.includes('input')) runInput.input = args.input;
    if (def.requires.includes('groundTruth')) runInput.groundTruth = args.groundTruth ?? undefined;
    const res = await scorer.run(runInput);
    results.push({ scorerId: id, score: res.score, reason: res.reason });
  }
  return results;
}
