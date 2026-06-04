import { EMPTY_TRUST, type SpecializedAgentSpec } from '@seta/agent-sdk';
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
) =>
  makeOrchestratorAgent({
    taskAnalyzer: stub('staffing.taskAnalyzer'),
    skillMatcher: stub('staffing.skillMatcher'),
    avaiChecker: stub('staffing.avaiChecker'),
    recommender: stub('staffing.recommender'),
    resolveModel: () => ({}) as never,
    runAgent: async () => ({ toolCalls, toolResults }),
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
});
