import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { withTemporalContext } from '@seta/agent-sdk';

export type ChatIntent = 'assignment' | 'planner_qna' | 'weekly_planner';

/** Tier 1 is hard-coded: only the `planner` domain exists today. When a second
 *  domain (people/hiring) lands, add a tier-1 domain classifier above this and
 *  give that domain its own tier-2 classifier. */
export const ACTIVE_DOMAIN = 'planner' as const;

export type ClassifierHistory = ReadonlyArray<{ role: string; content: unknown }>;

export interface IntentClassifierDeps {
  resolveModel: () => MastraModelConfig;
  /** Override/seam for the ambiguous-case LLM fallback (used in tests). */
  classifyLlm?: (userText: string, history?: ClassifierHistory) => Promise<ChatIntent>;
}

// Weekly-planning intent → weekly_planner. Checked BEFORE ACTION_RE: planning
// phrases carry no assignment verb but say "tasks"/"week" and must not fall
// through to assignment or planner_qna.
const WEEKLY_RE =
  /\b(plan\s+(my|this|the|next)\s+week|weekly\s+plan|(organi[sz]e|schedule|prioriti[sz]e)\s+my\s+(week|tasks?))\b|lập kế hoạch tuần|sắp xếp công việc/i;

// Action/recommend intent → assignment. Checked first; assignment verbs win.
// Also catches find-tasks-by-label/criteria queries (task analyzer find_tasks intent).
// Deliberately narrow: "my open tasks" stays planner_qna; only label/criteria searches go assignment.
const ACTION_RE =
  /\b(assign|reassign|re-assign|recommend|delegate|staff this|who should|find (people|someone|users|a person|tasks?)\b|list tasks?\b|(find|list|show)\s+open\s+tasks?\b|tasks?\s+(with|tagged|labeled|in|for)\b|tìm task)\b/i;

// Read-only question intent → planner_qna. Only reached when ACTION_RE did not match.
const QUESTION_RE =
  /\b(what|which|how many|how much|when|where|who is|who's|whose|list|show me|do i have|are there|count)\b/i;

// Short confirmations / negations that are follow-ups to the previous turn.
// When matched, re-use the previous turn's intent so the same orchestrator
// handles the continuation (e.g. "yes" after "Would you like me to recommend?").
const CONFIRM_RE =
  /^\s*(yes|yeah|yep|yup|ok|okay|sure|go ahead|do it|please|please do|confirm|approved?|no|nope|nah|cancel|never\s*mind|có|ừ|ờ|uh|vâng|được|đồng ý|làm đi|không|thôi|hủy)\s*[.!?]*\s*$/i;

function inferIntentFromHistory(history?: ClassifierHistory): ChatIntent | undefined {
  if (!history?.length) return undefined;
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m?.role !== 'user') continue;
    const text = typeof m.content === 'string' ? m.content : '';
    if (WEEKLY_RE.test(text)) return 'weekly_planner';
    if (ACTION_RE.test(text)) return 'assignment';
    if (QUESTION_RE.test(text)) return 'planner_qna';
    break;
  }
  return undefined;
}

async function llmFallback(
  deps: IntentClassifierDeps,
  userText: string,
  history?: ClassifierHistory,
): Promise<ChatIntent> {
  const agent = new Agent({
    id: 'chat.intentClassifier',
    name: 'Chat Intent Classifier',
    instructions: withTemporalContext(
      'Classify the user message as exactly one word: "assignment", "weekly_planner", or "planner_qna".\n' +
        '\n' +
        '"assignment" — use when the user wants to:\n' +
        '  • assign, reassign, recommend, or delegate work to someone\n' +
        '  • find or list tasks by skill, label, area, or status (e.g. open/overdue tasks in a domain)\n' +
        '  • search for tasks matching a criteria (infrastructure, frontend, devops, etc.)\n' +
        '  • find people with a certain skill for a task\n' +
        '\n' +
        '"weekly_planner" — use when the user wants their OWN workload organized into a\n' +
        'day-by-day schedule:\n' +
        '  • plan, organize, or prioritize their week or their task list\n' +
        '  • turn a list of tasks into a weekly schedule\n' +
        '  • rebalance or regenerate an existing weekly plan\n' +
        '\n' +
        '"planner_qna" — use when the user wants to:\n' +
        '  • read details about a specific task (deadline, description, assignee)\n' +
        '  • check their own task list or workload\n' +
        '  • ask about plans, groups, or team structure\n' +
        '\n' +
        'The message may be in Vietnamese or English.\n' +
        'If conversation history is provided, use it to understand what the user is referring to.\n' +
        'Output only the single word, nothing else.',
    ),
    model: deps.resolveModel(),
  });
  const historyPrefix = history?.length
    ? `Recent conversation:\n${history.map((m) => `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n')}\n\nCurrent message: `
    : '';
  const r = await agent.generate(`${historyPrefix}${userText}`);
  const t = r.text ?? '';
  if (/weekly_planner/i.test(t)) return 'weekly_planner';
  return /assignment/i.test(t) ? 'assignment' : 'planner_qna';
}

/** Returns the tier-2 intent for a planner-domain chat turn. */
export function makeIntentClassifier(deps: IntentClassifierDeps) {
  return async function classify(
    userText: string,
    history?: ClassifierHistory,
  ): Promise<ChatIntent> {
    if (WEEKLY_RE.test(userText)) return 'weekly_planner';
    if (ACTION_RE.test(userText)) return 'assignment';
    if (QUESTION_RE.test(userText)) return 'planner_qna';
    // Short confirmation/negation ("yes", "ok", "không") → stay on the same
    // orchestrator that handled the previous turn so conversational follow-ups
    // don't lose context by routing to a different agent.
    if (CONFIRM_RE.test(userText)) {
      const prev = inferIntentFromHistory(history);
      if (prev) return prev;
    }
    if (deps.classifyLlm) return deps.classifyLlm(userText, history);
    return llmFallback(deps, userText, history);
  };
}
