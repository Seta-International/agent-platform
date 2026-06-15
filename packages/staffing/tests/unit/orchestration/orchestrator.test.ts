import type { RequestContext } from '@mastra/core/request-context';
import { InMemoryStore } from '@mastra/core/storage';
import { EMPTY_TRUST, RC_THREAD_ID, type SpecializedAgentSpec } from '@seta/agent-sdk';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { makeOrchestratorAgent } from '../../../src/backend/orchestration/orchestrator.ts';

const ctx = { tenantId: 't1', actorUserId: 'a1' };

// proposeAssignment's assign port — never exercised here: every test drives the
// orchestrator via the runAgent seam, so the composite tool is bypassed.
const noopAssign = { assign: async () => {} };

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
    userProfileLookup: { findByName: async () => [] },
    assign: noopAssign,
    resolveModel: () => ({}) as never,
    mastraStorage: new InMemoryStore(),
    runAgent: async () => ({ toolCalls, toolResults, text }),
  });

describe('orchestrator assembly', () => {
  it('describe-skills: taskAnalyzer skills only → { skills }, no recommendations', async () => {
    const agent = make([
      { payload: { toolName: 'staffing_analyzeTasks', result: { skills: ['aws', 'terraform'] } } },
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
      { payload: { toolName: 'staffing_analyzeTasks', result: { skills: ['aws'] } } },
      {
        payload: {
          toolName: 'staffing_rankRecommendations',
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
      { payload: { toolName: 'staffing_analyzeTasks', result: { skills: ['aws', 'docker'] } } },
      {
        payload: {
          toolName: 'staffing_matchCandidatesBySkill',
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
      { payload: { toolName: 'staffing_analyzeTasks', result: { skills: ['cobol'] } } },
      {
        payload: {
          toolName: 'staffing_matchCandidatesBySkill',
          result: { taskId: null, candidates: [] },
        },
      },
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
        { payload: { toolName: 'staffing_analyzeTasks', result: { skills: ['aws'] } } },
        {
          payload: {
            toolName: 'staffing_matchCandidatesBySkill',
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
      [{ payload: { toolName: 'staffing_checkCandidateAvailability', args: { taskId: 't-1' } } }],
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
          toolName: 'staffing_analyzeTasks',
          result: {
            tasks: [
              {
                taskId: 't9',
                title: 'Infra A',
                status: 'not_started',
                labels: ['infrastructure'],
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
          toolName: 'staffing_analyzeTasks',
          result: {
            tasks: [
              {
                taskId: 't9',
                title: 'Infra A',
                status: 'not_started',
                labels: ['infrastructure'],
              },
            ],
          },
        },
      },
      {
        payload: {
          toolName: 'staffing_rankRecommendations',
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
      [{ payload: { toolName: 'staffing_analyzeTasks', result: {} } }],
      [{ payload: { toolName: 'staffing_checkCandidateAvailability', args: {} } }],
      'Some chatty LLM filler that must not leak.',
    );
    const res = await agent.run({ userText: 'who should do this task', taskId: 't-1' }, ctx);
    expect(res.result.message).toBe(
      "I couldn't complete the recommendation for this task. Please try again.",
    );
  });

  it('document question: staffing_answerQuestion answer → { message } at 0.6 confidence', async () => {
    const agent = make([
      {
        payload: {
          toolName: 'staffing_answerQuestion',
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
    const agent = make([
      { payload: { toolName: 'staffing_answerQuestion', result: { answer: '   ' } } },
    ]);
    const res = await agent.run({ userText: 'hmm', taskId: null }, ctx);
    expect(res.result.message).toContain('I can describe');
  });
});

describe('orchestrator request-context wiring', () => {
  it('sets RC_THREAD_ID when ctx provides a thread id', async () => {
    let rcSeen: RequestContext | undefined;
    const agent = makeOrchestratorAgent({
      taskAnalyzer: stub('staffing.taskAnalyzer'),
      skillMatcher: stub('staffing.skillMatcher'),
      avaiChecker: stub('staffing.avaiChecker'),
      recommender: stub('staffing.recommender'),
      generalAnswer: stub('staffing.generalAnswer'),
      userProfileLookup: { findByName: async () => [] },
      assign: noopAssign,
      resolveModel: () => ({}) as never,
      mastraStorage: new InMemoryStore(),
      runAgent: async ({ requestContext }) => {
        rcSeen = requestContext;
        return { toolCalls: [], toolResults: [], text: 'hi' };
      },
    });
    await agent.run({ userText: 'hello', taskId: null }, { ...ctx, threadId: 'conv-9' });
    expect(rcSeen?.get(RC_THREAD_ID)).toBe('conv-9');
  });

  it('leaves RC_THREAD_ID unset when ctx has no thread id', async () => {
    let rcSeen: RequestContext | undefined;
    const agent = makeOrchestratorAgent({
      taskAnalyzer: stub('staffing.taskAnalyzer'),
      skillMatcher: stub('staffing.skillMatcher'),
      avaiChecker: stub('staffing.avaiChecker'),
      recommender: stub('staffing.recommender'),
      generalAnswer: stub('staffing.generalAnswer'),
      userProfileLookup: { findByName: async () => [] },
      assign: noopAssign,
      resolveModel: () => ({}) as never,
      mastraStorage: new InMemoryStore(),
      runAgent: async ({ requestContext }) => {
        rcSeen = requestContext;
        return { toolCalls: [], toolResults: [], text: 'hi' };
      },
    });
    await agent.run({ userText: 'hello', taskId: null }, ctx);
    expect(rcSeen?.get(RC_THREAD_ID)).toBeUndefined();
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
      userProfileLookup: { findByName: async () => [] },
      assign: noopAssign,
      resolveModel: () => ({}) as never,
      mastraStorage: new InMemoryStore(),
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
    expect(Object.keys(seen()?.tools ?? {})).toContain('staffing_analyzeTasks');
  });

  it('base instructions mention the staffing_answerQuestion document/general route', async () => {
    const { agent, seen } = capture();
    await agent.run({ userText: 'hello', taskId: null }, ctx);
    expect(seen()?.instructions).toContain('staffing_answerQuestion');
  });
});
