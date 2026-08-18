// packages/planner/tests/fixtures/golden/ctx-from-case.ts
//
// Maps a validated agent GoldenCase + the captured trajectory + the run's answer
// into the PolicyEvalContext the deterministic scorers consume. Pure.
import type { PolicyEvalContext } from './policy/registry.ts';
import type { ToolCall, Trajectory } from './policy/trajectory.ts';
import type { Expected, GoldenCase } from './schema.ts';

// --- Behavior classification signals ----------------------------------------
//
// A deterministic (no-LLM) observed-behavior classifier. It reads BOTH the
// answer text AND the trajectory, because three of the six behaviors are only
// distinguishable with trajectory context that the answer text alone cannot
// provide:
//   • error-recovery — a tool actually failed (threw ⇒ ok:false, or returned a
//     graceful `{error}`), yet the agent still produced a substantive answer.
//   • empty          — a *collection/search* tool succeeded but returned zero
//     rows (a "no results" outcome), vs. a not-found single entity, which is a
//     normal `answer`.
// Refusal and clarification remain phrasing signals (the agent's response IS
// the observable), so they stay text-driven but with broadened patterns.

/** Refusal phrasing (read-only agent declining a write / out-of-domain ask).
 *  No `?` requirement — a refusal is a statement, not a question. */
const REFUSE_RE =
  /\b(cannot|can'?t|can not|could not help|won'?t|will not|not able|unable|not allowed|not permitted|no permission|don'?t have permission|not authorized|read[- ]only|only (?:answer|provide|help|assist|respond))\b/;

/** Disambiguation phrasing. Paired with a `?` so a normal answer that merely
 *  ends in an offer ("want me to list them?") is not misread as a clarify. */
const CLARIFY_RE =
  /\b(which one|which of|did you mean|do you mean|more than one|multiple (?:match|group|task|plan|user|member|people)|ambiguous|please specify|could you specify|can you clarify|need more detail)\b/;

/** Vietnamese refusal phrasings (FUT-825 / design D9). Deliberately NOT a bare
 *  `tôi không` — "Tôi không rõ bạn muốn task nào" is a clarification, and the
 *  refuse branch runs first, so a loose pattern here would swallow it. */
const REFUSE_VI_RE =
  /(không thể|không được phép|không có quyền|chưa có quyền|không hỗ trợ|chỉ có thể|không xo[áa] (?:vĩnh viễn|được)|vượt quá giới hạn|quá giới hạn)/;

/** Vietnamese disambiguation phrasings. Paired with the same `?` requirement as
 *  the English pattern, so a statement that merely contains "ngày nào" in prose
 *  is not misread as a question. */
const CLARIFY_VI_RE =
  /((?:task|việc|công việc|cái|người|ngày|giá trị|nhóm|plan) nào|ý bạn là|bạn muốn nói|có (?:hai|nhiều|nhiều hơn một)|vui lòng cho biết|bạn cho tôi biết|\bhay\b)/;

/** Failure narration: the agent telling the user it could not retrieve data.
 *  A secondary signal for error-recovery when the tool returned a graceful
 *  `{error}` (ok:true) rather than throwing. */
const FAILURE_TEXT_RE =
  /\b(couldn'?t (?:find|retrieve|load|get|access)|could not (?:find|retrieve|load|get|access)|unable to (?:find|retrieve|load|get|access)|ran into (?:an? )?(?:error|problem|issue)|something went wrong|an error occurred|failed to (?:retrieve|load|get))\b/;

/** *Search* tools whose result directly answers the user's find-intent: an
 *  empty result set here means the ask found nothing (⇒ empty behavior). This
 *  is intentionally NARROWER than "any list tool": an auxiliary list that comes
 *  back empty (e.g. listComments on a task that simply has no discussion) must
 *  NOT flip a substantive answer to `empty`, and an entity resolver/getter
 *  (resolveMember, getTask, getBoardSnapshot) coming back not-found is a normal
 *  `answer`, not an empty list. resolveMember shares the `candidates` result
 *  shape with searchGroupMembersBySkills, so this MUST key on tool name, not
 *  result shape. */
const SEARCH_TOOLS = new Set([
  'planner_queryTasks',
  'planner_findSimilarTasks',
  'planner_searchGroupMembersBySkills',
]);

/** True when `call` observably failed: it threw (ok:false) or returned a
 *  graceful `{ error: "…" }` payload (ok:true). */
function callFailed(call: ToolCall): boolean {
  if (!call.ok) return true;
  const r = call.result;
  return (
    typeof r === 'object' &&
    r !== null &&
    typeof (r as { error?: unknown }).error === 'string' &&
    (r as { error: string }).error.length > 0
  );
}

/** Emptiness of a tool result: `true` when every array field is empty, `false`
 *  when at least one array field has rows, `null` when the shape carries no
 *  array field (indeterminate — not a collection payload). */
function collectionEmptiness(result: unknown): boolean | null {
  if (Array.isArray(result)) return result.length === 0;
  if (typeof result !== 'object' || result === null) return null;
  const arrays = Object.values(result as Record<string, unknown>).filter(Array.isArray);
  if (arrays.length === 0) return null;
  return arrays.every((a) => (a as unknown[]).length === 0);
}

/** True when a SEARCH tool succeeded (ok, no `{error}`) and returned no rows. */
function searchReturnedEmpty(call: ToolCall): boolean {
  if (!SEARCH_TOOLS.has(call.toolName) || callFailed(call)) return false;
  return collectionEmptiness(call.result) === true;
}

/** True when a SEARCH tool succeeded and returned at least one row. */
function searchReturnedData(call: ToolCall): boolean {
  if (!SEARCH_TOOLS.has(call.toolName) || callFailed(call)) return false;
  return collectionEmptiness(call.result) === false;
}

/**
 * Facts about the turn that the STREAM knows and the text cannot say.
 *
 * A suspended turn has no assembled result — `finalize()` is never called — so
 * its `answer` is only the narration emitted before the card. Deciding the
 * behaviour from that text is guesswork; the `tool-call-suspended` chunk is
 * proof. Same for a resumed Confirm, which is a completed run by construction.
 */
export interface ObservedSignals {
  /** The turn ended at a `tool-call-suspended` chunk. */
  suspended?: boolean;
  /** The turn was a resume (Confirm) that ran to completion. */
  applied?: boolean;
  /** The user cancelled: the lane did not resume, so no model ran at all. */
  declined?: boolean;
}

/**
 * Classifies observed behavior from the answer + trajectory. Priority order is
 * significant:
 *   1. blank answer            → empty
 *   2. refusal phrasing        → refuse
 *   3. disambiguation question → clarify (a deliberate ask wins over a failed
 *      tool, e.g. an ambiguity surfaced as a graceful `{error}`)
 *   4. a failed tool call      → error-recovery
 *   5. empty collection result → empty
 *   6. otherwise               → answer
 */
export function deriveObservedBehavior(
  answer: string,
  trajectory: Trajectory,
  signals: ObservedSignals = {},
): string {
  // Stream truth beats phrasing, always. Ordered applied-first because a resume
  // is never also a suspend.
  if (signals.declined) return 'declined';
  if (signals.applied) return 'applied';
  if (signals.suspended) return 'confirm';

  const a = answer.trim();
  if (a.length === 0) return 'empty';
  const lower = a.toLowerCase();

  if (REFUSE_RE.test(lower) || REFUSE_VI_RE.test(lower)) return 'refuse';
  if ((CLARIFY_RE.test(lower) || CLARIFY_VI_RE.test(lower)) && a.includes('?')) return 'clarify';

  const anyFailed = trajectory.toolCalls.some(callFailed);
  if (anyFailed || FAILURE_TEXT_RE.test(lower)) return 'error-recovery';

  // The user's find-intent found nothing: a search tool came back empty and no
  // search tool returned rows (an auxiliary lookup returning data is irrelevant).
  const anySearchEmpty = trajectory.toolCalls.some(searchReturnedEmpty);
  const anySearchData = trajectory.toolCalls.some(searchReturnedData);
  if (anySearchEmpty && !anySearchData) return 'empty';

  return 'answer';
}

/** One turn's observed outcome, as the A2 driver produces it. */
export interface TurnResult {
  answer: string;
  trajectory: Trajectory;
  signals: ObservedSignals;
  dbEffects?: NonNullable<PolicyEvalContext['dbEffects']>;
}

/** Shared shape builder. `expected` and `userText` differ per caller; everything
 *  else is identical, which is why A1 and A2 must not grow two copies of it. */
function buildCtx(args: {
  expected: Expected;
  userText: string;
  result: TurnResult;
}): PolicyEvalContext {
  const t = args.expected.trajectory ?? {};
  const constraints = {
    requiredTools: t.requiredTools ?? [],
    allowedTools: t.allowedTools ?? [],
    forbiddenTools: t.forbiddenTools ?? [],
    requiredPartialOrder: t.requiredPartialOrder ?? [],
    argPredicates: t.argPredicates ?? [],
    maxToolCalls: t.maxToolCalls,
    trajectoryDeclared: args.expected.trajectory !== undefined,
  };
  // Only successful calls are a legitimate source (a failed call returned no data).
  const toolResults = args.result.trajectory.toolCalls
    .filter((call) => call.ok)
    .map((call) => call.result);
  return {
    trajectory: args.result.trajectory,
    constraints,
    observedBehavior: deriveObservedBehavior(
      args.result.answer,
      args.result.trajectory,
      args.result.signals,
    ),
    expectedBehaviorValue: args.expected.behavior,
    answer: args.result.answer,
    expectedDelegationTool: constraints.requiredTools[0],
    forbiddenEntities: args.expected.output?.forbiddenEntities ?? [],
    forbiddenText: args.expected.output?.forbiddenText ?? [],
    requiredText: args.expected.output?.requiredText ?? [],
    userText: args.userText,
    toolResults,
    groundNumbers: args.expected.trajectory?.groundNumbers ?? false,
    ...(args.result.dbEffects ? { dbEffects: args.result.dbEffects } : {}),
  };
}

/** Scoring context for ONE turn of a conversation case. */
export function ctxFromTurn(
  c: GoldenCase,
  turnIndex: number,
  result: TurnResult,
): PolicyEvalContext {
  if (c.kind !== 'conversation') throw new Error(`ctxFromTurn: unsupported kind "${c.kind}"`);
  const turn = c.turns[turnIndex];
  if (!turn) throw new Error(`ctxFromTurn: ${c.id} has no turn ${turnIndex}`);
  return buildCtx({
    expected: turn.expected,
    userText: 'user' in turn ? turn.user : '',
    result,
  });
}

export function ctxFromCase(
  c: GoldenCase,
  trajectory: Trajectory,
  answer: string,
  signals: ObservedSignals = {},
): PolicyEvalContext {
  if (c.kind !== 'agent' && c.kind !== 'conversation') {
    throw new Error(`ctxFromCase: unsupported kind "${c.kind}"`);
  }
  if (c.kind === 'conversation') {
    return ctxFromTurn(c, c.turns.length - 1, { answer, trajectory, signals });
  }
  return buildCtx({
    expected: c.expected,
    userText: c.input.messages[c.input.messages.length - 1]?.content ?? '',
    result: { answer, trajectory, signals },
  });
}
