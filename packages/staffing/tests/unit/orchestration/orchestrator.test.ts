import type { RequestContext } from '@mastra/core/request-context';
import {
  EMPTY_TRUST,
  RC_AGENT_MEMORY,
  RC_THREAD_ID,
  type SpecializedAgentSpec,
} from '@seta/agent-sdk';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { makeOrchestratorAgent } from '../../../src/backend/orchestration/orchestrator.ts';

const ctx = { tenantId: 't1', actorUserId: 'a1' };

// Sub-agent stubs are never called: every test uses the runAgent seam, so the
// orchestrator's real tools (which would call these) are bypassed.
const stub = <I, O>(id: string): SpecializedAgentSpec<I, O> => ({
  id,
  description: '',
  inputSchema: z.any() as z.ZodType<I>,
  outputSchema: z.any() as z.ZodType<O>,
  run: async () => ({ result: {} as O, trust: EMPTY_TRUST }),
});

const make = (
  toolResults: { payload: { toolName: string; result: unknown } }[],
  toolCalls: { payload: { toolName: string; args?: unknown } }[] = [],
  text?: string,
) =>
  makeOrchestratorAgent({
    taskAnalyzer: stub('staffing.taskAnalyzer'),
    skillMatcher: stub('staffing.skillMatcher'),
    avaiChecker: stub('staffing.avaiChecker'),
    recommender: stub('staffing.recommender'),
    generalAnswer: stub('staffing.generalAnswer'),
    resolveModel: () => ({}) as never,
    runAgent: async () => ({ toolCalls, toolResults, text }),
  });

describe('orchestrator assembly', () => {
  it('describe-skills: taskAnalyzer skills only → { skills }, no recommendations', async () => {
    const agent = make([
      { payload: { toolName: 'callTaskAnalyzer', result: { skills: ['aws', 'terraform'] } } },
    ]);
    const res = await agent.run(
      { userText: 'what skills does this task need', taskId: 't-1' },
      ctx,
    );
    expect(res.result.skills).toEqual(['aws', 'terraform']);
    expect(res.result.recommendations).toBeUndefined();
    expect(res.result.tasks).toBeUndefined();
  });

  it('recommend: recommender result → { recommendations } (skills are intermediate)', async () => {
    const agent = make([
      { payload: { toolName: 'callTaskAnalyzer', result: { skills: ['aws'] } } },
      {
        payload: {
          toolName: 'callRecommender',
          result: {
            taskId: 't-1',
            recommendations: [
              { userId: 'u1', name: 'A', skillMatch: ['aws'], skillMatchCount: 1, status: 'busy' },
            ],
          },
        },
      },
    ]);
    const res = await agent.run({ userText: 'who should do this task', taskId: 't-1' }, ctx);
    expect(res.result.recommendations?.[0]?.userId).toBe('u1');
    expect(res.result.skills).toBeUndefined();
  });

  it('people search: skillMatcher candidates with no downstream call → { candidates }', async () => {
    // "find users with aws and docker" is terminal at skillMatcher: the user
    // wants the top matches, not an assignee recommendation.
    const agent = make([
      { payload: { toolName: 'callTaskAnalyzer', result: { skills: ['aws', 'docker'] } } },
      {
        payload: {
          toolName: 'callSkillMatcher',
          result: {
            taskId: null,
            candidates: [
              {
                userId: 'u1',
                name: 'A',
                skills: ['aws', 'docker'],
                role: 'Backend Dev',
                skillMatchCount: 2,
                rank: 1,
              },
            ],
          },
        },
      },
    ]);
    const res = await agent.run({ userText: 'find users with aws and docker', taskId: null }, ctx);
    expect(res.result.candidates?.[0]?.userId).toBe('u1');
    expect(res.result.recommendations).toBeUndefined();
    expect(res.result.skills).toBeUndefined();
    expect(res.result.message).toBeUndefined();
    // The candidates ARE the answer: they carry the evidence citations.
    expect(res.trust.evidenceCitations).toEqual([{ kind: 'user', id: 'u1', label: 'A' }]);
    expect(res.trust.confidenceScore).toBe(0.8);
  });

  it('people search with zero matches → { candidates: [] }, not the generic message', async () => {
    const agent = make([
      { payload: { toolName: 'callTaskAnalyzer', result: { skills: ['cobol'] } } },
      { payload: { toolName: 'callSkillMatcher', result: { taskId: null, candidates: [] } } },
    ]);
    const res = await agent.run({ userText: 'find users with cobol', taskId: null }, ctx);
    expect(res.result.candidates).toEqual([]);
    expect(res.result.message).toBeUndefined();
  });

  it('recommend attempted (downstream called) but no recommender result → message, not candidates', async () => {
    // taskAnalyzer's skills are pipeline INPUT for skillMatcher, not the answer.
    // Once the recommend pipeline went past skillMatcher (avaiChecker called)
    // but yielded no recommendation, we must NOT echo the intermediate skills
    // or candidates as if the user asked a people search — honest failure.
    const agent = make(
      [
        { payload: { toolName: 'callTaskAnalyzer', result: { skills: ['aws'] } } },
        {
          payload: {
            toolName: 'callSkillMatcher',
            result: {
              taskId: 't-1',
              candidates: [
                {
                  userId: 'u1',
                  name: 'A',
                  skills: ['aws'],
                  role: null,
                  skillMatchCount: 1,
                  rank: 1,
                },
              ],
            },
          },
        },
      ],
      [{ payload: { toolName: 'callAvaiChecker', args: { taskId: 't-1' } } }],
    );
    const res = await agent.run({ userText: 'who should do this task', taskId: 't-1' }, ctx);
    expect(res.result.skills).toBeUndefined();
    expect(res.result.candidates).toBeUndefined();
    expect(typeof res.result.message).toBe('string');
  });

  it('find only: taskAnalyzer tasks → { tasks } each without recommendations', async () => {
    const agent = make([
      {
        payload: {
          toolName: 'callTaskAnalyzer',
          result: {
            tasks: [
              {
                taskId: 't9',
                title: 'Infra A',
                status: 'not_started',
                skillTags: ['infrastructure'],
              },
            ],
          },
        },
      },
    ]);
    const res = await agent.run({ userText: 'find infrastructure tasks', taskId: null }, ctx);
    expect(res.result.tasks).toHaveLength(1);
    expect(res.result.tasks?.[0]?.task.taskId).toBe('t9');
    expect(res.result.tasks?.[0]?.recommendations).toBeUndefined();
  });

  it('find + recommend: maps recommender results onto their task by taskId', async () => {
    const agent = make([
      {
        payload: {
          toolName: 'callTaskAnalyzer',
          result: {
            tasks: [
              {
                taskId: 't9',
                title: 'Infra A',
                status: 'not_started',
                skillTags: ['infrastructure'],
              },
            ],
          },
        },
      },
      {
        payload: {
          toolName: 'callRecommender',
          result: {
            taskId: 't9',
            recommendations: [
              {
                userId: 'u2',
                name: 'B',
                skillMatch: ['infrastructure'],
                skillMatchCount: 1,
                status: 'busy',
              },
            ],
          },
        },
      },
    ]);
    const res = await agent.run({ userText: 'find infra tasks then recommend', taskId: null }, ctx);
    expect(res.result.tasks?.[0]?.recommendations?.[0]?.userId).toBe('u2');
  });

  it('nothing actionable → a message', async () => {
    const agent = make([]);
    const res = await agent.run({ userText: 'hi', taskId: null }, ctx);
    expect(typeof res.result.message).toBe('string');
    expect(res.result.skills).toBeUndefined();
  });

  it('no tools ran + LLM text → the text becomes the message (post-decision acks)', async () => {
    const agent = make([], [], 'Noted — the assignment has been approved.');
    const res = await agent.run({ userText: 'Approved', taskId: null }, ctx);
    expect(res.result.message).toBe('Noted — the assignment has been approved.');
  });

  it('no tools and no text → the generic capability message', async () => {
    const agent = make([]);
    const res = await agent.run({ userText: 'hi', taskId: null }, ctx);
    expect(res.result.message).toContain('I can describe');
  });

  it('tools ran but produced nothing → honest failure message, NOT the LLM text', async () => {
    const agent = make(
      [{ payload: { toolName: 'callTaskAnalyzer', result: {} } }],
      [{ payload: { toolName: 'callAvaiChecker', args: {} } }],
      'Some chatty LLM filler that must not leak.',
    );
    const res = await agent.run({ userText: 'who should do this task', taskId: 't-1' }, ctx);
    expect(res.result.message).toBe(
      "I couldn't complete the recommendation for this task. Please try again.",
    );
  });

  it('document question: callGeneralAnswer answer → { message } at 0.6 confidence', async () => {
    const agent = make([
      {
        payload: {
          toolName: 'callGeneralAnswer',
          result: { answer: 'It is a Q3 budget report.' },
        },
      },
    ]);
    const res = await agent.run(
      {
        userText: 'Context:\n<<<FILE: a.pdf>>>\n...\n<<<END a.pdf>>>\n\nwhat is this?',
        taskId: null,
      },
      ctx,
    );
    expect(res.result.message).toBe('It is a Q3 budget report.');
    expect(res.result.skills).toBeUndefined();
    expect(res.result.candidates).toBeUndefined();
    expect(res.trust.confidenceScore).toBe(0.6);
  });

  it('empty general answer → falls through to the generic capability message', async () => {
    const agent = make([{ payload: { toolName: 'callGeneralAnswer', result: { answer: '   ' } } }]);
    const res = await agent.run({ userText: 'hmm', taskId: null }, ctx);
    expect(res.result.message).toContain('I can describe');
  });
});

describe('orchestrator HITL approval post-step', () => {
  const ANALYZER_RESULT = {
    payload: {
      toolName: 'callTaskAnalyzer',
      result: { skills: ['aws'], title: 'AWS migration' },
    },
  };
  const REC_TOOL_RESULT = {
    payload: {
      toolName: 'callRecommender',
      result: {
        taskId: 't-1',
        recommendations: [
          {
            userId: 'u1',
            name: 'Alice',
            skillMatch: ['aws'],
            skillMatchCount: 1,
            status: 'available',
            availabilityScore: 0.9,
          },
          {
            userId: 'u2',
            name: 'Bob',
            skillMatch: ['aws'],
            skillMatchCount: 1,
            status: 'busy',
            availabilityScore: 0.3,
          },
        ],
      },
    },
  };

  function fakeRecorder() {
    const calls: unknown[] = [];
    const recorder = async (card: unknown) => {
      calls.push(card);
      return { runId: 'wr1', approvalId: 'ap1' };
    };
    return { calls, recorder };
  }

  it('recommend with a real taskId + recorder → records the card and sets pendingApproval', async () => {
    const { calls, recorder } = fakeRecorder();
    const agent = make([ANALYZER_RESULT, REC_TOOL_RESULT]);
    const res = await agent.run(
      { userText: 'who should do this task', taskId: 't-1' },
      { ...ctx, recordHitlApproval: recorder },
    );
    expect(res.result.pendingApproval).toEqual({
      approvalId: 'ap1',
      taskId: 't-1',
      inThread: true,
    });
    expect(res.result.recommendations).toHaveLength(2);
    expect(calls).toHaveLength(1);
    const card = calls[0] as {
      intent: string;
      primary: { argsPatch?: Record<string, unknown> };
      meta: { toolId: string };
    };
    expect(card.intent).toBe('Assign "AWS migration"');
    expect(card.primary.argsPatch).toEqual({
      action: 'assign',
      assigneeUserIds: ['u1'],
      taskId: 't-1',
    });
    expect(card.meta.toolId).toBe('planner_proposeAssignment');
  });

  it('task-less recommend (recommender taskId null) → no card, no pendingApproval', async () => {
    const { calls, recorder } = fakeRecorder();
    const recResult = REC_TOOL_RESULT.payload.result;
    const agent = make([
      { payload: { toolName: 'callTaskAnalyzer', result: { skills: ['aws'] } } },
      { payload: { toolName: 'callRecommender', result: { ...recResult, taskId: null } } },
    ]);
    const res = await agent.run(
      { userText: 'recommend someone for aws work', taskId: null },
      { ...ctx, recordHitlApproval: recorder },
    );
    expect(res.result.pendingApproval).toBeUndefined();
    expect(res.result.recommendations).toHaveLength(2);
    expect(calls).toHaveLength(0);
  });

  it('people search (candidates terminal) → recorder not called', async () => {
    const { calls, recorder } = fakeRecorder();
    const agent = make([
      { payload: { toolName: 'callTaskAnalyzer', result: { skills: ['aws'] } } },
      {
        payload: {
          toolName: 'callSkillMatcher',
          result: {
            taskId: null,
            candidates: [
              { userId: 'u1', name: 'A', skills: ['aws'], role: null, skillMatchCount: 1, rank: 1 },
            ],
          },
        },
      },
    ]);
    const res = await agent.run(
      { userText: 'find users with aws', taskId: null },
      { ...ctx, recordHitlApproval: recorder },
    );
    expect(res.result.candidates).toHaveLength(1);
    expect(res.result.pendingApproval).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it('find+recommend tasks path → recorder not called (single-task scope only)', async () => {
    const { calls, recorder } = fakeRecorder();
    const agent = make([
      {
        payload: {
          toolName: 'callTaskAnalyzer',
          result: {
            tasks: [
              { taskId: 't9', title: 'Infra A', status: 'not_started', skillTags: ['infra'] },
            ],
          },
        },
      },
      {
        payload: {
          toolName: 'callRecommender',
          result: { ...REC_TOOL_RESULT.payload.result, taskId: 't9' },
        },
      },
    ]);
    const res = await agent.run(
      { userText: 'find infra tasks and recommend people', taskId: null },
      { ...ctx, recordHitlApproval: recorder },
    );
    expect(res.result.tasks).toHaveLength(1);
    expect(res.result.pendingApproval).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it('no recorder in ctx → result unchanged (queued runner / non-chat callers)', async () => {
    const agent = make([ANALYZER_RESULT, REC_TOOL_RESULT]);
    const res = await agent.run({ userText: 'who should do this task', taskId: 't-1' }, ctx);
    expect(res.result.pendingApproval).toBeUndefined();
    expect(res.result.recommendations).toHaveLength(2);
  });

  it('recorder reuses a card from another thread → pendingApproval.inThread is false', async () => {
    const recorder = async () => ({ runId: 'wr1', approvalId: 'ap1', cardInThread: false });
    const agent = make([ANALYZER_RESULT, REC_TOOL_RESULT]);
    const res = await agent.run(
      { userText: 'who should do this task', taskId: 't-1' },
      { ...ctx, recordHitlApproval: recorder },
    );
    expect(res.result.pendingApproval).toEqual({
      approvalId: 'ap1',
      taskId: 't-1',
      inThread: false,
    });
  });

  it('recorder throws → fail-open: recommendations kept, no pendingApproval', async () => {
    const recorder = async () => {
      throw new Error('db down');
    };
    const agent = make([ANALYZER_RESULT, REC_TOOL_RESULT]);
    const res = await agent.run(
      { userText: 'who should do this task', taskId: 't-1' },
      { ...ctx, recordHitlApproval: recorder },
    );
    expect(res.result.pendingApproval).toBeUndefined();
    expect(res.result.recommendations).toHaveLength(2);
  });
});

describe('orchestrator request-context wiring', () => {
  it('sets RC_THREAD_ID and RC_AGENT_MEMORY when ctx provides them', async () => {
    let rcSeen: RequestContext | undefined;
    const handle = { memory: {} as never, memoryConfig: {} };
    const agent = makeOrchestratorAgent({
      taskAnalyzer: stub('staffing.taskAnalyzer'),
      skillMatcher: stub('staffing.skillMatcher'),
      avaiChecker: stub('staffing.avaiChecker'),
      recommender: stub('staffing.recommender'),
      generalAnswer: stub('staffing.generalAnswer'),
      resolveModel: () => ({}) as never,
      runAgent: async ({ requestContext }) => {
        rcSeen = requestContext;
        return { toolCalls: [], toolResults: [], text: 'hi' };
      },
    });
    await agent.run(
      { userText: 'hello', taskId: null },
      { ...ctx, threadId: 'conv-9', entitiesMemory: handle as never },
    );
    expect(rcSeen?.get(RC_THREAD_ID)).toBe('conv-9');
    expect(rcSeen?.get(RC_AGENT_MEMORY)).toBe(handle);
  });

  it('leaves the keys unset when ctx has no thread/memory', async () => {
    let rcSeen: RequestContext | undefined;
    const agent = makeOrchestratorAgent({
      taskAnalyzer: stub('staffing.taskAnalyzer'),
      skillMatcher: stub('staffing.skillMatcher'),
      avaiChecker: stub('staffing.avaiChecker'),
      recommender: stub('staffing.recommender'),
      generalAnswer: stub('staffing.generalAnswer'),
      resolveModel: () => ({}) as never,
      runAgent: async ({ requestContext }) => {
        rcSeen = requestContext;
        return { toolCalls: [], toolResults: [], text: 'hi' };
      },
    });
    await agent.run({ userText: 'hello', taskId: null }, ctx);
    expect(rcSeen?.get(RC_THREAD_ID)).toBeUndefined();
    expect(rcSeen?.get(RC_AGENT_MEMORY)).toBeUndefined();
  });
});

describe('orchestrator resource working memory', () => {
  function capture() {
    let seen: { instructions: string; tools: Record<string, unknown> } | undefined;
    const agent = makeOrchestratorAgent({
      taskAnalyzer: stub('staffing.taskAnalyzer'),
      skillMatcher: stub('staffing.skillMatcher'),
      avaiChecker: stub('staffing.avaiChecker'),
      recommender: stub('staffing.recommender'),
      generalAnswer: stub('staffing.generalAnswer'),
      resolveModel: () => ({}) as never,
      runAgent: async (args) => {
        seen = { instructions: args.instructions, tools: args.tools };
        return { toolCalls: [], toolResults: [], text: 'hi' };
      },
    });
    return { agent, seen: () => seen };
  }

  it('appends the userContext section and exposes updateWorkingMemory when userMemory is present', async () => {
    const { agent, seen } = capture();
    const handle = {
      memory: { getSystemMessage: async () => 'WM-SECTION' },
      memoryConfig: {},
    };
    await agent.run(
      { userText: 'hello', taskId: null },
      { ...ctx, threadId: 'conv-1', userMemory: handle as never },
    );
    expect(seen()?.instructions).toContain('WM-SECTION');
    expect(Object.keys(seen()?.tools ?? {})).toContain('updateWorkingMemory');
  });

  it('runs with the base instructions and no WM tool when userMemory is absent', async () => {
    const { agent, seen } = capture();
    await agent.run({ userText: 'hello', taskId: null }, ctx);
    expect(seen()?.instructions).not.toContain('WM-SECTION');
    expect(Object.keys(seen()?.tools ?? {})).not.toContain('updateWorkingMemory');
    expect(Object.keys(seen()?.tools ?? {})).toContain('callTaskAnalyzer');
  });

  it('base instructions mention the callGeneralAnswer document/general route', async () => {
    const { agent, seen } = capture();
    await agent.run({ userText: 'hello', taskId: null }, ctx);
    expect(seen()?.instructions).toContain('callGeneralAnswer');
  });
});
