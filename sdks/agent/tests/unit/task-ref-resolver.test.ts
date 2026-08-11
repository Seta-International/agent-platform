import { afterEach, describe, expect, it, vi } from 'vitest';
import { setConversationMemory } from '../../src/conversation-memory.ts';
import { AgentToolError } from '../../src/errors.ts';
import { resolveTaskRef, TaskRefResolveError } from '../../src/task-ref-resolver.ts';
import { EMPTY_ENTITIES, serializeEntities } from '../../src/working-memory-schema.ts';

const UUID_A = '66be2be2-394d-4184-b106-c412289fd1e1';
const UUID_B = '499f9898-2133-4ba3-82b5-83d9fb1996fc';

// The conversation memory lives in a process-local holder, NOT on the
// RequestContext — Mastra serializes the RequestContext around tool execution,
// which would strip a live Memory instance's prototype methods. The ctx only
// carries the serializable thread_id.
function buildCtx(recentTaskIds: Array<{ taskId: string; title: string }>) {
  const now = new Date().toISOString();
  const entities = {
    ...EMPTY_ENTITIES,
    recentTasks: recentTaskIds.map((t) => ({ ...t, lastSeenAt: now })),
  };
  setConversationMemory({
    memory: { getWorkingMemory: vi.fn(async () => serializeEntities(entities)) },
    memoryConfig: {},
  } as never);
  return {
    // ctx.agent carries Mastra's randomized sub-thread — resolver must ignore it
    // and read the real chat thread id from RC_THREAD_ID instead.
    agent: { threadId: 'mangled-subthread', resourceId: 'r-1' },
    requestContext: {
      get: (k: string) => (k === 'thread_id' ? 'conv-1' : undefined),
    },
  } as never;
}

afterEach(() => setConversationMemory(undefined));

describe('resolveTaskRef', () => {
  it('resolves via the process-local holder, not a RequestContext-carried Memory', async () => {
    // Regression: Mastra round-trips the RequestContext through JSON, so a live
    // Memory placed on it loses its methods. Even when the RequestContext carries
    // NO memory at all, resolution must still work via the holder.
    const ctx = buildCtx([{ taskId: UUID_A, title: 'A' }]);
    expect((await resolveTaskRef(ctx, 'first')).taskId).toBe(UUID_A);
  });

  it('returns UUID as-is', async () => {
    const ctx = buildCtx([{ taskId: UUID_A, title: 'A' }]);
    expect(await resolveTaskRef(ctx, UUID_A)).toEqual({ taskId: UUID_A, source: 'uuid' });
  });

  it('resolves "#1" / "1" / "first" → most recent', async () => {
    const ctx = buildCtx([
      { taskId: UUID_A, title: 'A' },
      { taskId: UUID_B, title: 'B' },
    ]);
    for (const ref of ['#1', '1', 'first', 'First', '  #1  ']) {
      expect((await resolveTaskRef(ctx, ref)).taskId).toBe(UUID_A);
    }
  });

  it('resolves "last" / "latest" / "most recent" → index 0', async () => {
    const ctx = buildCtx([
      { taskId: UUID_A, title: 'A' },
      { taskId: UUID_B, title: 'B' },
    ]);
    for (const ref of ['last', 'latest', 'most recent']) {
      expect((await resolveTaskRef(ctx, ref)).taskId).toBe(UUID_A);
    }
  });

  it('resolves "#2" / "second" → next', async () => {
    const ctx = buildCtx([
      { taskId: UUID_A, title: 'A' },
      { taskId: UUID_B, title: 'B' },
    ]);
    expect((await resolveTaskRef(ctx, '#2')).taskId).toBe(UUID_B);
    expect((await resolveTaskRef(ctx, 'second')).taskId).toBe(UUID_B);
  });

  it('throws structured error with availableTasks when ordinal out of range', async () => {
    const ctx = buildCtx([{ taskId: UUID_A, title: 'A' }]);
    await expect(resolveTaskRef(ctx, '#7')).rejects.toThrow(/no.*7/i);
  });

  it('throws structured error when memory is empty', async () => {
    const ctx = buildCtx([]);
    await expect(resolveTaskRef(ctx, 'first')).rejects.toThrow(/no recent tasks/i);
  });

  it('rejects garbage strings', async () => {
    const ctx = buildCtx([{ taskId: UUID_A, title: 'A' }]);
    await expect(resolveTaskRef(ctx, 'banana')).rejects.toThrow(
      /not a task id|not a uuid|unrecognized/i,
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Title resolution (FUT-859). `recentTasks[].title` was written by seven tools
// and read by nobody, so a model that NAMED a task instead of numbering it
// dead-ended in the catch-all TOOL_ERROR. Titles the conversation has already
// surfaced resolve HERE — deterministically, with no extra LLM round trip.
// ───────────────────────────────────────────────────────────────────────────
describe('resolveTaskRef — title', () => {
  it('resolves the exact title, ignoring case and repeated whitespace', async () => {
    const ctx = buildCtx([
      { taskId: UUID_A, title: 'Finish documentation about prod' },
      { taskId: UUID_B, title: 'AWS migration' },
    ]);
    for (const ref of [
      'Finish documentation about prod',
      'finish documentation about prod',
      '  Finish   documentation  about prod  ',
    ]) {
      expect(await resolveTaskRef(ctx, ref)).toEqual({ taskId: UUID_A, source: 'title' });
    }
  });

  it('resolves a title the user shortened or padded with filler words', async () => {
    const ctx = buildCtx([
      { taskId: UUID_A, title: 'Finish documentation about prod' },
      { taskId: UUID_B, title: 'AWS migration' },
    ]);
    // ref ⊂ title
    expect((await resolveTaskRef(ctx, 'documentation about prod')).taskId).toBe(UUID_A);
    // title ⊂ ref
    expect((await resolveTaskRef(ctx, 'the AWS migration task')).taskId).toBe(UUID_B);
  });

  it('matches whole words only, so a one-letter title cannot swallow an unrelated ref', async () => {
    // Regression guard: plain substring containment made title "A" match "banana".
    const ctx = buildCtx([{ taskId: UUID_A, title: 'A' }]);
    await expect(resolveTaskRef(ctx, 'banana')).rejects.toBeInstanceOf(TaskRefResolveError);
  });

  it('prefers an exact title over a task that merely contains it', async () => {
    const ctx = buildCtx([
      { taskId: UUID_A, title: 'Deploy prod again' },
      { taskId: UUID_B, title: 'Deploy prod' },
    ]);
    expect((await resolveTaskRef(ctx, 'Deploy prod')).taskId).toBe(UUID_B);
  });

  it('refuses to choose when two recent tasks match, and names both', async () => {
    const ctx = buildCtx([
      { taskId: UUID_A, title: 'Deploy prod api' },
      { taskId: UUID_B, title: 'Deploy prod web' },
    ]);
    const err = await resolveTaskRef(ctx, 'deploy prod').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TaskRefResolveError);
    expect((err as Error).message).toMatch(/Deploy prod api/);
    expect((err as Error).message).toMatch(/Deploy prod web/);
    expect((err as Error).message).toMatch(/which one|ambiguous/i);
  });

  it('lists the candidate titles when nothing matches, so a typo stays recoverable', async () => {
    // The production input: the user misspelled "documentation". Naming the
    // candidates lets the model correct itself on its next step, which is why no
    // fuzzy matcher belongs in a write path.
    const ctx = buildCtx([
      { taskId: UUID_A, title: 'Finish documentation about prod' },
      { taskId: UUID_B, title: 'AWS migration' },
    ]);
    const err = await resolveTaskRef(ctx, 'Finish documenation about prod').catch(
      (e: unknown) => e,
    );
    expect((err as Error).message).toMatch(/Finish documentation about prod/);
    expect((err as Error).message).toMatch(/#1/);
    expect((err as Error).message).toMatch(/planner_queryTasks/);
    expect((err as TaskRefResolveError).availableTasks).toHaveLength(2);
  });

  it('tells the model how to search when the conversation has surfaced no task', async () => {
    const ctx = buildCtx([]);
    const err = await resolveTaskRef(ctx, 'Finish documentation about prod').catch(
      (e: unknown) => e,
    );
    expect((err as Error).message).toMatch(/planner_queryTasks/);
    expect((err as Error).message).toMatch(/titleContains/);
  });
});

describe('TaskRefResolveError taxonomy', () => {
  it('is an AgentToolError, so wrapExecute forwards its message instead of masking it', async () => {
    // wrap-execute.ts re-throws AgentToolError as-is; anything else becomes
    // TOOL_ERROR + "An internal error occurred." — which the model cannot act on.
    const ctx = buildCtx([{ taskId: UUID_A, title: 'AWS migration' }]);
    const err = await resolveTaskRef(ctx, 'a task nobody mentioned').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AgentToolError);
    expect(err).toMatchObject({ code: 'VALIDATION', retryable: false });
    // .message === userMessage is what Mastra hands the LLM (errors.ts:25).
    expect((err as AgentToolError).message).toBe((err as AgentToolError).userMessage);
  });
});
