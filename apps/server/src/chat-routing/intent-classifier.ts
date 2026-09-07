import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { withTemporalContext } from '@seta/agent-sdk';

export type ChatIntent = 'assignment' | 'planner_qna' | 'weekly_planner' | 'mutate';

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

// The seam FUT-806 draws is WHO CHOOSES THE PERSON (design D1). The agent must
// choose → the assignment runtime's recommend pipeline. The user already named
// them → A2's planner_assignTask, which is a `mutate`. Both readings share almost
// every verb, so the order below is the whole mechanism: RECOMMEND_RE first,
// ASSIGN_RE second, MUTATE_RE third.
//
// RECOMMEND_RE — the agent must choose. Checked BEFORE ASSIGN_RE because
// recommend-shaped phrasings ("who should I assign this to") satisfy both and the
// recommend reading is the one the user meant.
//
// `assign (someone|anyone|…)` lives here on purpose (design D10): it is the
// highest-traffic phrasing that names nobody, and sending it to A2 would turn a
// working recommend flow into a refusal.
//
// The Vietnamese half is load-bearing and was a bug fix, not decoration: before
// it, the only Vietnamese alternative anywhere was `tìm task`, so asking for a
// PERSON in Vietnamese fell through to the LLM fallback — non-deterministic and
// defaulting to planner_qna, whose read-only agent answers by refusing. Do not
// collapse it back into a bare `gợi ý`/`tìm`: those verbs also introduce ordinary
// mutate requests ("gợi ý due date"), and scoping them to a person noun is what
// keeps the two tiers apart.
//
// No trailing \b after a diacritic alternative ("có thể", "làm được"): JS \b is
// ASCII-only, so 'ể' followed by a space is not a boundary and the branch would
// never match.
const RECOMMEND_RE =
  /\b(who should|recommend|suggest|delegate|staff this|find (people|someone|users|a person)\b|(assign|reassign|unassign)\s+(someone|anyone|somebody|a person)\b)|tìm (người|ai|nhân sự|ứng viên)|\bai (nên|phù hợp|thích hợp|có thể|làm được)|(người|nhân sự|ứng viên) (nào )?(phù hợp|thích hợp)|(gợi ý|đề xuất|đề cử) (giúp )?(người|ai|nhân sự|ứng viên)|giao [^.?!]{0,30}cho ai\b/i;

// ASSIGN_RE — the user NAMED the person, so this is A2's planner_assignTask.
// Checked BEFORE MUTATE_RE: "đổi người phụ trách sang Tuấn" and "change the
// assignee to Tuấn" satisfy both, and routing them on the generic change verb
// would land them in the same place anyway — but "thay B bằng A" matches no
// MUTATE_RE verb at all, so without this pattern it reaches the LLM fallback.
const ASSIGN_RE =
  /\b(assign|reassign|re-assign|unassign)\b|\b(assignee|owner)\b|người phụ trách|người được giao|giao lại|giao thêm|phụ trách|\bgiao\b|thay [^.?!]{0,30}bằng/i;

// Change-request intent → mutate (the A2 Action agent). Unchanged by FUT-806.
const MUTATE_RE =
  /\b(create|add|update|change|set|move|rename|reschedule|postpone|close|reopen|complete|finish|link|merge|delete|remove)\b|\bmark\b[^.?!]*\b(as|done|complete)\b|tạo|thêm|sửa|đổi|dời|đóng|mở lại|gộp|liên kết|xoá|xóa|hoàn thành/i;

// What is LEFT of the old ACTION_RE once the assignment verbs move out: task
// search by label/criteria, which still lives behind the assignment intent. That
// is a pre-existing oddity — splitting it belongs to A1's story, not this one.
// Deliberately narrow: "my open tasks" stays planner_qna.
const ACTION_RE =
  /\b(find tasks?\b|list tasks?\b|(find|list|show)\s+open\s+tasks?\b|tasks?\s+(with|tagged|labeled|in|for)\b)|tìm task/i;

// Read-only question intent → planner_qna. Only reached when ACTION_RE did not match.
const QUESTION_RE =
  /\b(what|which|how many|how much|when|where|who is|who's|whose|list|show me|do i have|are there|count)\b/i;

// Short confirmations / negations that are follow-ups to the previous turn.
// When matched, re-use the previous turn's intent so the same orchestrator
// handles the continuation (e.g. "yes" after "Would you like me to recommend?").
const CONFIRM_WORDS =
  'yes|yeah|yep|yup|ok|okay|sure|go ahead|do it|please|please do|confirm|approved?|no|nope|nah|cancel|never\\s*mind|có|ừ|ờ|uh|vâng|được|đồng ý|làm đi|không|thôi|hủy';
// A confirmation may be a comma-joined pair of these words ("ừ, làm đi",
// "ok, do it") — still nothing but assent, so it still continues the last turn.
const CONFIRM_RE = new RegExp(
  `^\\s*(?:${CONFIRM_WORDS})(?:\\s*,\\s*(?:${CONFIRM_WORDS}))*\\s*[.!?]*\\s*$`,
  'i',
);

function inferIntentFromHistory(history?: ClassifierHistory): ChatIntent | undefined {
  if (!history?.length) return undefined;
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m?.role !== 'user') continue;
    const text = typeof m.content === 'string' ? m.content : '';
    if (WEEKLY_RE.test(text)) return 'weekly_planner';
    if (RECOMMEND_RE.test(text)) return 'assignment';
    if (ASSIGN_RE.test(text)) return 'mutate';
    if (MUTATE_RE.test(text)) return 'mutate';
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
      'Classify the user message as exactly one word: "assignment", "weekly_planner", "mutate", or "planner_qna".\n' +
        '\n' +
        '"assignment" — use when the user wants to:\n' +
        '  • recommend or suggest WHO should do a task, when the user names nobody\n' +
        '    ("who should do this", "assign someone to this")\n' +
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
        '"mutate" — use when the user wants to CHANGE something: edit a task\'s title,\n' +
        'description, deadline, start date, priority or status; close, reopen, merge, link\n' +
        'or delete a task; or set WHO a task is assigned to when the user NAMES the person\n' +
        '("assign this to Tuan", "thay Binh bang Tuan").\n' +
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
  if (/mutate/i.test(t)) return 'mutate';
  return /assignment/i.test(t) ? 'assignment' : 'planner_qna';
}

/** Returns the tier-2 intent for a planner-domain chat turn. */
export function makeIntentClassifier(deps: IntentClassifierDeps) {
  return async function classify(
    userText: string,
    history?: ClassifierHistory,
  ): Promise<ChatIntent> {
    if (WEEKLY_RE.test(userText)) return 'weekly_planner';
    // Recommend beats assign: "who should I assign this to" satisfies both.
    if (RECOMMEND_RE.test(userText)) return 'assignment';
    // Assign beats mutate: "change the assignee to Tuấn" satisfies both, and
    // only one of them has an assign tool.
    if (ASSIGN_RE.test(userText)) return 'mutate';
    if (MUTATE_RE.test(userText)) return 'mutate';
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
