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
// Also catches find-tasks-by-label/criteria queries (task analyzer find_tasks intent).
// Deliberately narrow: "my open tasks" stays planner_qna; only label/criteria searches go staffing.
const ACTION_RE =
  /\b(assign|reassign|re-assign|recommend|delegate|staff this|who should|find (people|someone|users|a person|tasks?)\b|list tasks?\b|(find|list|show)\s+open\s+tasks?\b|tasks?\s+(with|tagged|labeled|in|for)\b|tìm task)\b/i;

// Read-only question intent → planner_qna. Only reached when ACTION_RE did not match.
const QUESTION_RE =
  /\b(what|which|how many|how much|when|where|who is|who's|whose|list|show me|do i have|are there|count)\b/i;

async function llmFallback(deps: IntentClassifierDeps, userText: string): Promise<ChatIntent> {
  const agent = new Agent({
    id: 'chat.intentClassifier',
    name: 'Chat Intent Classifier',
    instructions:
      'Classify the user message as exactly one word: "staffing" or "planner_qna".\n' +
      '\n' +
      '"staffing" — use when the user wants to:\n' +
      '  • assign, reassign, recommend, or delegate work to someone\n' +
      '  • find or list tasks by skill, label, area, or status (e.g. open/overdue tasks in a domain)\n' +
      '  • search for tasks matching a criteria (infrastructure, frontend, devops, etc.)\n' +
      '  • find people with a certain skill for a task\n' +
      '\n' +
      '"planner_qna" — use when the user wants to:\n' +
      '  • read details about a specific task (deadline, description, assignee)\n' +
      '  • check their own task list or workload\n' +
      '  • ask about plans, groups, or team structure\n' +
      '\n' +
      'The message may be in Vietnamese or English. Output only the single word, nothing else.',
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
