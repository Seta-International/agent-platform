import { RequestContext } from '@mastra/core/request-context';
import {
  EMPTY_ENTITIES,
  EMPTY_TRUST,
  parseEntities,
  RC_THREAD_ID,
  type SpecializedAgentSpec,
  serializeEntities,
  setConversationMemory,
} from '@seta/agent-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { makeOrchestratorTools } from '../../../src/backend/orchestration/orchestrator.tools.ts';

const UUID_A = '66be2be2-394d-4184-b106-c412289fd1e1';
const UUID_B = '499f9898-2133-4ba3-82b5-83d9fb1996fc';
// Recommendation userIds must be real UUIDs: ConversationEntitiesSchema
// validates lastProposedCandidateUserId as uuid on the parse round-trip.
const UUID_U = '0b54f3da-7be4-4d51-9b32-d0a63aa39c2b';

// Fake thread-scoped memory handle — same seam the SDK's own entity-recorder
// tests use. `read()` parses what the recorder wrote back.
function memCtx(initialTasks: Array<{ taskId: string; title: string }> = []) {
  const now = new Date().toISOString();
  let stored: string | null = serializeEntities({
    ...EMPTY_ENTITIES,
    recentTasks: initialTasks.map((t) => ({ ...t, lastSeenAt: now })),
  });
  const memory = {
    getWorkingMemory: vi.fn(async () => stored),
    updateWorkingMemory: vi.fn(async ({ workingMemory }: { workingMemory: string }) => {
      stored = workingMemory;
    }),
  };
  const rc = new RequestContext();
  rc.set('tenant_id', 't1');
  rc.set('actor', { type: 'user', user_id: 'a1' });
  rc.set(RC_THREAD_ID, 'conv-1');
  // The conversation memory lives in a process-local holder, not on the
  // RequestContext (which Mastra serializes around tool execution).
  setConversationMemory({ memory, memoryConfig: {} } as never);
  return {
    toolCtx: { requestContext: rc } as never,
    memory,
    read: () => parseEntities(stored),
  };
}

afterEach(() => setConversationMemory(undefined));

// Sub-agent stub that records the inputs it was called with.
function capturingStub<I, O>(id: string, result: O) {
  const inputs: I[] = [];
  const spec: SpecializedAgentSpec<I, O> = {
    id,
    description: '',
    inputSchema: z.any() as z.ZodType<I>,
    outputSchema: z.any() as z.ZodType<O>,
    run: async (input) => {
      inputs.push(input);
      return { result, trust: EMPTY_TRUST };
    },
  };
  return { spec, inputs };
}

function buildTools(
  overrides: { taskAnalyzerResult?: unknown; recommenderResult?: unknown; userText?: string } = {},
) {
  const taskAnalyzer = capturingStub<
    { intent: string; query: string; taskId: string | null },
    unknown
  >('staffing.taskAnalyzer', overrides.taskAnalyzerResult ?? { skills: ['aws'] });
  const skillMatcher = capturingStub('staffing.skillMatcher', { taskId: null, candidates: [] });
  const avaiChecker = capturingStub('staffing.avaiChecker', { taskId: null, availability: [] });
  const recommender = capturingStub(
    'staffing.recommender',
    overrides.recommenderResult ?? { taskId: null, recommendations: [] },
  );
  const generalAnswer = capturingStub<{ query: string }, { answer: string }>(
    'staffing.generalAnswer',
    { answer: '' },
  );
  const profileCalls: Array<{ name: string; limit?: number }> = [];
  const tools = makeOrchestratorTools({
    taskAnalyzer: taskAnalyzer.spec as never,
    skillMatcher: skillMatcher.spec as never,
    avaiChecker: avaiChecker.spec as never,
    recommender: recommender.spec as never,
    generalAnswer: generalAnswer.spec as never,
    userProfileLookup: {
      findByName: async (name, _ctx, limit) => {
        profileCalls.push({ name, limit });
        return [];
      },
    },
    assign: { assign: async () => {} },
    userText: overrides.userText ?? '',
    ctx: { tenantId: 't1', actorUserId: 'a1' },
  });
  return {
    tools,
    taskAnalyzer,
    skillMatcher,
    avaiChecker,
    recommender,
    generalAnswer,
    profileCalls,
  };
}

describe('staffing_analyzeTasks taskRef resolution', () => {
  it('resolves an ordinal taskRef against recentTasks and hands the UUID to the sub-agent', async () => {
    const { toolCtx } = memCtx([
      { taskId: UUID_A, title: 'A' },
      { taskId: UUID_B, title: 'B' },
    ]);
    const { tools, taskAnalyzer } = buildTools({
      taskAnalyzerResult: { skills: ['aws'], title: 'A' },
    });
    const out = (await tools.staffing_analyzeTasks.execute!(
      {
        intent: 'resolve_task_skills',
        query: 'assignee for the first task',
        taskRef: 'first',
      } as never,
      toolCtx,
    )) as { resolvedTaskId: string | null };
    expect(taskAnalyzer.inputs[0]?.taskId).toBe(UUID_A);
    expect(out.resolvedTaskId).toBe(UUID_A);
  });

  it('passes a UUID taskRef through unchanged', async () => {
    const { toolCtx } = memCtx();
    const { tools, taskAnalyzer } = buildTools();
    await tools.staffing_analyzeTasks.execute!(
      { intent: 'resolve_task_skills', query: 'q', taskRef: UUID_B } as never,
      toolCtx,
    );
    expect(taskAnalyzer.inputs[0]?.taskId).toBe(UUID_B);
  });

  it('passes null through when taskRef is null', async () => {
    const { toolCtx, memory } = memCtx();
    const { tools, taskAnalyzer } = buildTools();
    await tools.staffing_analyzeTasks.execute!(
      { intent: 'extract_named_skills', query: 'who knows aws', taskRef: null } as never,
      toolCtx,
    );
    expect(taskAnalyzer.inputs[0]?.taskId).toBeNull();
    expect(memory.getWorkingMemory).not.toHaveBeenCalled();
  });

  it('rejects with the resolver error when the ordinal cannot resolve', async () => {
    const { toolCtx } = memCtx([]); // empty conversation memory
    const { tools, taskAnalyzer } = buildTools();
    // defineAgentTool's wrapper (sdks/agent/src/wrap-execute.ts) remaps the
    // TaskRefResolveError into an AgentToolError whose .message is the generic
    // user-safe text; the resolver's message survives in .internalDetail.
    await expect(
      tools.staffing_analyzeTasks.execute!(
        { intent: 'resolve_task_skills', query: 'q', taskRef: 'first' } as never,
        toolCtx,
      ),
    ).rejects.toMatchObject({
      name: 'AgentToolError',
      internalDetail: expect.stringMatching(/no recent tasks/i),
    });
    expect(taskAnalyzer.inputs).toHaveLength(0); // sub-agent never invoked
  });
});

describe('result-limit pass-through', () => {
  it('staffing_analyzeTasks forwards the requested find_tasks limit to the sub-agent', async () => {
    const { toolCtx } = memCtx();
    const { tools, taskAnalyzer } = buildTools({
      taskAnalyzerResult: { tasks: [] },
    });
    await tools.staffing_analyzeTasks.execute!(
      { intent: 'find_tasks', query: 'find 5 infra tasks', taskRef: null, limit: 5 } as never,
      toolCtx,
    );
    expect((taskAnalyzer.inputs[0] as { limit?: number }).limit).toBe(5);
  });

  it('staffing_lookupUserProfile forwards the requested limit to the profile port', async () => {
    const { toolCtx } = memCtx();
    const { tools, profileCalls } = buildTools();
    await tools.staffing_lookupUserProfile.execute!({ name: 'Alice', limit: 3 } as never, toolCtx);
    expect(profileCalls).toEqual([{ name: 'Alice', limit: 3 }]);
  });
});

describe('entity recording', () => {
  it('find_tasks records the returned tasks as recentTasks in batch order', async () => {
    const { toolCtx, read } = memCtx();
    const { tools } = buildTools({
      taskAnalyzerResult: {
        tasks: [
          { taskId: UUID_A, title: 'Infra A', labels: ['aws'] },
          { taskId: UUID_B, title: 'Infra B', labels: ['k8s'] },
        ],
      },
    });
    await tools.staffing_analyzeTasks.execute!(
      { intent: 'find_tasks', query: 'find infra tasks', taskRef: null } as never,
      toolCtx,
    );
    expect(read().recentTasks.map((t) => t.taskId)).toEqual([UUID_A, UUID_B]);
  });

  it('resolve_task_skills records lastDiscussedTaskId (+ recentTasks when a title comes back)', async () => {
    const { toolCtx, read } = memCtx([{ taskId: UUID_A, title: 'A' }]);
    const { tools } = buildTools({
      taskAnalyzerResult: { skills: ['aws'], title: 'A full title' },
    });
    await tools.staffing_analyzeTasks.execute!(
      { intent: 'resolve_task_skills', query: 'q', taskRef: 'first' } as never,
      toolCtx,
    );
    const entities = read();
    expect(entities.lastDiscussedTaskId).toBe(UUID_A);
    expect(entities.recentTasks[0]).toMatchObject({ taskId: UUID_A, title: 'A full title' });
  });

  it('staffing_rankRecommendations records lastDiscussedTaskId + lastProposedCandidateUserId', async () => {
    const { toolCtx, read } = memCtx();
    const { tools } = buildTools({
      recommenderResult: {
        taskId: UUID_A,
        recommendations: [
          { userId: UUID_U, name: 'A', skillMatch: ['aws'], skillMatchCount: 1, status: 'free' },
        ],
      },
    });
    await tools.staffing_rankRecommendations.execute!(
      { taskId: UUID_A, skills: ['aws'], candidates: [], availability: [] } as never,
      toolCtx,
    );
    const entities = read();
    expect(entities.lastDiscussedTaskId).toBe(UUID_A);
    expect(entities.lastProposedCandidateUserId).toBe(UUID_U);
  });

  it('recording is a silent no-op when the memory handle is absent', async () => {
    const rc = new RequestContext();
    rc.set('tenant_id', 't1');
    rc.set('actor', { type: 'user', user_id: 'a1' });
    const toolCtx = { requestContext: rc } as never;
    const { tools } = buildTools({
      taskAnalyzerResult: { tasks: [{ taskId: UUID_A, title: 'A', labels: [] }] },
    });
    // Must not throw — workflow/cron contexts have no chat memory.
    await expect(
      tools.staffing_analyzeTasks.execute!(
        { intent: 'find_tasks', query: 'q', taskRef: null } as never,
        toolCtx,
      ),
    ).resolves.toBeDefined();
  });
});

describe('staffing_answerQuestion', () => {
  it('passes the orchestrator userText verbatim to the general-answer sub-agent', async () => {
    const userText =
      'Context:\n<<<FILE: a.pdf>>>\nhello world\n<<<END a.pdf>>>\n\nwhat does it say?';
    const { tools, generalAnswer } = buildTools({ userText });
    // The tool ignores LLM-supplied args (empty input) and reads the captured
    // userText from the closure. It still needs a real requestContext: the SDK's
    // defineAgentTool wrapper (wrap-execute.ts) reads tenant_id off it before the
    // body runs. Pass empty input, but a tenant-bearing toolCtx.
    const rc = new RequestContext();
    rc.set('tenant_id', 't1');
    rc.set('actor', { type: 'user', user_id: 'a1' });
    const out = (await tools.staffing_answerQuestion.execute!(
      {} as never,
      {
        requestContext: rc,
      } as never,
    )) as {
      answer: string;
    };
    expect(generalAnswer.inputs[0]?.query).toBe(userText);
    expect(out).toEqual({ answer: '' });
  });
});
