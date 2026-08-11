import { getConversationMemory } from './conversation-memory.ts';
import { AgentToolError } from './errors.ts';
import { RC_THREAD_ID } from './request-context.ts';
import { parseEntities, type RecentTask } from './working-memory-schema.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ORDINAL_WORDS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
};
const LAST_WORDS = new Set(['last', 'latest', 'most recent', 'previous']);

type ToolExecuteCtx = {
  agent?: { threadId?: string; resourceId?: string };
  requestContext?: { get: (k: string) => unknown };
};

export type TaskRefResolution = {
  taskId: string;
  source: 'uuid' | 'ordinal' | 'keyword' | 'title';
};

/**
 * The model-facing contract for every `taskRef` field, kept next to the resolver
 * that implements it. Six tools had hand-copied their own wording and all six
 * said "UUID or ordinal" long after `recentTasks` started carrying titles, so the
 * model was told a title was invalid while nothing rejected it. One grammar, one
 * sentence describing it.
 */
export const TASK_REF_DESCRIPTION =
  'Task UUID, or a reference resolved against the tasks already mentioned in this ' +
  'conversation — either an ordinal ("#1" / "1" / "first" → most recent, "#2" / ' +
  '"second" → next, "last" → most recent), or the task\'s name, exact or shortened ' +
  '("the AWS migration task" resolves "AWS migration"). Prefer an ordinal for ' +
  'something just discussed. Never invent a UUID: if the task has not come up yet, ' +
  'find it with planner_queryTasks (titleContains, status "any") and pass back its taskId.';

/**
 * An AgentToolError, not a bare Error, and deliberately so: `wrapExecute`
 * re-throws AgentToolError untouched but rewrites everything else into
 * `TOOL_ERROR` + "An internal error occurred. Please try again or contact
 * support." — a message the model cannot act on, which is how one mistyped task
 * name dead-ended a whole turn (FUT-859). VALIDATION because the input was
 * wrong, not the tool: the message names the recovery, so the model fixes it on
 * its next step instead of apologising to the user.
 */
export class TaskRefResolveError extends AgentToolError {
  readonly availableTasks: ReadonlyArray<RecentTask>;

  constructor(message: string, availableTasks: ReadonlyArray<RecentTask>) {
    super({
      code: 'VALIDATION',
      retryable: false,
      // Same string both ways: there is nothing private in a task reference the
      // model itself supplied, and masking it is what broke self-correction.
      userMessage: message,
      internalDetail: message,
      toolId: 'resolveTaskRef',
    });
    this.availableTasks = availableTasks;
    this.name = 'TaskRefResolveError';
  }
}

export async function resolveTaskRef(
  ctx: ToolExecuteCtx,
  rawRef: string,
): Promise<TaskRefResolution> {
  if (UUID_RE.test(rawRef.trim())) {
    return { taskId: rawRef.trim(), source: 'uuid' };
  }
  const ref = rawRef.trim().toLowerCase().replace(/^#/, '').trim();

  const recentTasks = await loadRecentTasks(ctx);

  if (LAST_WORDS.has(ref)) {
    const task = recentTasks[0];
    if (!task) {
      throw new TaskRefResolveError(
        `No recent tasks in this conversation to resolve "${rawRef}" against.`,
        [],
      );
    }
    return { taskId: task.taskId, source: 'keyword' };
  }

  const ordinal = ORDINAL_WORDS[ref] ?? (/^\d+$/.test(ref) ? Number(ref) : null);
  if (ordinal !== null) {
    if (recentTasks.length === 0) {
      throw new TaskRefResolveError(
        `No recent tasks in this conversation to resolve "${rawRef}" against. ${SEARCH_HINT}`,
        [],
      );
    }
    const task = recentTasks[ordinal - 1];
    if (!task) {
      throw new TaskRefResolveError(
        `No #${ordinal} in recent tasks (have ${recentTasks.length}): ${describe(recentTasks)}.`,
        recentTasks,
      );
    }
    return { taskId: task.taskId, source: 'ordinal' };
  }

  // Titles last, so a task literally called "2" can never shadow the ordinal.
  const byTitle = matchByTitle(recentTasks, rawRef);
  const [onlyMatch] = byTitle;
  if (onlyMatch && byTitle.length === 1) {
    return { taskId: onlyMatch.taskId, source: 'title' };
  }
  if (byTitle.length > 1) {
    throw new TaskRefResolveError(
      `"${rawRef}" is ambiguous — it matches ${byTitle.length} tasks in this conversation: ` +
        `${describe(byTitle)}. Ask the user which one they mean; do not pick for them.`,
      recentTasks,
    );
  }

  throw new TaskRefResolveError(unresolvableMessage(rawRef, recentTasks), recentTasks);
}

const SEARCH_HINT =
  'Call planner_queryTasks with titleContains set to a distinctive part of the name ' +
  'and status "any", then pass the taskId it returns.';

/** Numbered exactly as the ordinal branch indexes them, so a model handed this
 *  list can answer with either the name or the number. */
function describe(tasks: ReadonlyArray<RecentTask>): string {
  return tasks.map((t, i) => `#${i + 1} "${t.title}"`).join(', ');
}

function unresolvableMessage(rawRef: string, recentTasks: ReadonlyArray<RecentTask>): string {
  const head =
    `Cannot resolve "${rawRef}" to a task: it is not a task id, not a position ` +
    `("#1", "first", "last"), and no task with that name has appeared in this conversation.`;
  if (recentTasks.length === 0) return `${head} ${SEARCH_HINT}`;
  // Naming the candidates is what makes a misspelled title recoverable: the model
  // sees the real spelling and corrects itself. That is the whole reason no fuzzy
  // matcher lives here — guessing in a write path is worse than asking.
  return (
    `${head} Tasks already mentioned here: ${describe(recentTasks)}. ` +
    `Use one of those names, or its number, if the user meant it. Otherwise: ${SEARCH_HINT}`
  );
}

function normalizeTitle(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function titleTokens(s: string): string[] {
  return normalizeTitle(s).split(' ').filter(Boolean);
}

/**
 * Whole-token containment in either direction, so "the AWS migration task"
 * resolves "AWS migration" and "documentation about prod" resolves "Finish
 * documentation about prod".
 *
 * Token runs rather than plain substrings: `String.includes` let the title "A"
 * match the reference "banana", which would have handed a write tool the wrong
 * task.
 */
function tokenRunMatch(a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const [needle, haystack] = a.length <= b.length ? [a, b] : [b, a];
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    if (needle.every((tok, j) => haystack[i + j] === tok)) return true;
  }
  return false;
}

/** Exact titles win outright: with "Deploy prod" and "Deploy prod again" both
 *  present, "Deploy prod" is a precise reference, not an ambiguous one. */
function matchByTitle(tasks: ReadonlyArray<RecentTask>, rawRef: string): ReadonlyArray<RecentTask> {
  const wanted = normalizeTitle(rawRef);
  const exact = tasks.filter((t) => normalizeTitle(t.title) === wanted);
  if (exact.length > 0) return exact;
  const refTokens = titleTokens(rawRef);
  return tasks.filter((t) => tokenRunMatch(titleTokens(t.title), refTokens));
}

async function loadRecentTasks(ctx: ToolExecuteCtx): Promise<ReadonlyArray<RecentTask>> {
  const handle = getConversationMemory();
  if (!handle) return [];
  // Conversation entities are thread-scoped, keyed on the real chat thread id —
  // never ctx.agent.threadId (Mastra randomizes that per sub-agent delegation).
  const threadId = ctx.requestContext?.get(RC_THREAD_ID);
  if (typeof threadId !== 'string' || threadId.length === 0) return [];
  const raw = await handle.memory.getWorkingMemory({
    threadId,
    memoryConfig: handle.memoryConfig,
  });
  return parseEntities(raw).recentTasks;
}
