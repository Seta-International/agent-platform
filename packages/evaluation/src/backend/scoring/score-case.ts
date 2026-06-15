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

/**
 * Wrap a plain text string into the minimal MastraDBMessage shape that
 * getTextContentFromMastraDBMessage() can extract (it checks typeof content === 'string' first).
 * ScorerRunOutputForAgent = MastraDBMessage[]; ScorerRunInputForAgent has inputMessages: MastraDBMessage[].
 */
function toMsg(role: 'user' | 'assistant', text: string) {
  return { id: crypto.randomUUID(), role, createdAt: new Date(), content: text } as never;
}

function wrapOutput(output: string) {
  return [toMsg('assistant', output)];
}

function wrapInput(input: unknown) {
  const text = typeof input === 'string' ? input : JSON.stringify(input);
  return {
    inputMessages: [toMsg('user', text)],
    rememberedMessages: [],
    systemMessages: [],
    taggedSystemMessages: {},
  };
}

export async function scoreCase(args: ScoreCaseInput): Promise<ScoreResult[]> {
  const results: ScoreResult[] = [];
  for (const id of args.scorerIds) {
    const def = SCORER_REGISTRY[id];
    if (!def) continue;
    const scorer = def.build({ judgeModel: args.judgeModel });
    const runInput: Record<string, unknown> = { output: wrapOutput(args.output) };
    if (def.requires.includes('input')) runInput.input = wrapInput(args.input);
    if (def.requires.includes('groundTruth')) runInput.groundTruth = args.groundTruth ?? undefined;
    const res = await scorer.run(runInput);
    results.push({ scorerId: id, score: res.score, reason: res.reason });
  }
  return results;
}
