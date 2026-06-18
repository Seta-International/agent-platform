import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';

export type ChatIntent = 'staffing' | 'planner_qna';

/** Tier 1 is hard-coded: only the `planner` domain exists today. When a second
 *  domain (people/hiring) lands, add a tier-1 domain classifier above this and
 *  give that domain its own tier-2 classifier. */
export const ACTIVE_DOMAIN = 'planner' as const;

export interface IntentClassifierDeps {
  resolveModel: () => MastraModelConfig;
  /** Override/seam for the ambiguous-case LLM fallback (used in tests). */
  classifyLlm?: (userText: string) => Promise<ChatIntent>;
}

// Action/recommend intent → staffing. Checked first; assignment verbs win.
const ACTION_RE =
  /\b(assign|reassign|re-assign|recommend|delegate|staff this|who should|find (people|someone|users|a person)\b)/i;

// Read-only question intent → planner_qna.
const QUESTION_RE =
  /\b(what|which|how many|how much|when|where|who is|who's|whose|list|show me|do i have|are there|count)\b/i;

async function llmFallback(deps: IntentClassifierDeps, userText: string): Promise<ChatIntent> {
  const agent = new Agent({
    id: 'chat.intentClassifier',
    name: 'Chat Intent Classifier',
    instructions:
      'Classify the user message as exactly one word.\n' +
      '"staffing" = a request to assign/recommend/decide WHO does work.\n' +
      '"planner_qna" = a read-only QUESTION about tasks, plans, buckets, or team members.\n' +
      'Output only the single word, nothing else.',
    model: deps.resolveModel(),
  });
  const r = await agent.generate(userText);
  return /staffing/i.test(r.text ?? '') ? 'staffing' : 'planner_qna';
}

/** Returns the tier-2 intent for a planner-domain chat turn. */
export function makeIntentClassifier(deps: IntentClassifierDeps) {
  return async function classify(userText: string): Promise<ChatIntent> {
    if (ACTION_RE.test(userText)) return 'staffing';
    if (QUESTION_RE.test(userText)) return 'planner_qna';
    // Ambiguous: ask the LLM; default to the read-only flow if it is unavailable.
    if (deps.classifyLlm) return deps.classifyLlm(userText);
    return llmFallback(deps, userText);
  };
}
