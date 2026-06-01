import { describe, expect, it } from 'vitest';
import { assigneeRecommendationSpec } from '../../../src/backend/orchestration/assignee-recommendation.ts';

describe('assigneeRecommendation orchestration spec', () => {
  it('is a linear 4-step DAG wired analyze→match→avai→recommend', () => {
    expect(assigneeRecommendationSpec.id).toBe('staffing.assigneeRecommendation');
    expect(assigneeRecommendationSpec.steps.map((s) => s.id)).toEqual([
      'analyze',
      'match',
      'avai',
      'recommend',
    ]);
    expect(assigneeRecommendationSpec.steps.map((s) => s.agentId)).toEqual([
      'staffing.analyzer',
      'staffing.skillMatcher',
      'staffing.avaiChecker',
      'staffing.recommender',
    ]);
  });

  it('serializes per tenant', () => {
    expect(
      assigneeRecommendationSpec.serializationKey(
        { userText: 'x', taskId: null },
        { tenantId: 't1', actorUserId: 'u1' },
      ),
    ).toBe('staffing:reco:t1');
  });

  it('maps prior step outputs into each step input', () => {
    const state = {
      runId: 'r',
      orchestrationId: 'o',
      outputs: {
        analyze: { actionable: true, taskId: 'task-1', title: 'T', skills: ['a'] },
        match: { taskId: 'task-1', candidates: [{ userId: 'u1' }] },
        avai: { taskId: 'task-1', availability: [{ userId: 'u1' }] },
      },
    };
    const runIn = { userText: 'who', taskId: 'task-1' };
    expect(assigneeRecommendationSpec.steps[0]!.input(state, runIn)).toEqual(runIn);
    expect(assigneeRecommendationSpec.steps[1]!.input(state, runIn)).toEqual({
      taskId: 'task-1',
      skills: ['a'],
    });
    expect(assigneeRecommendationSpec.steps[2]!.input(state, runIn)).toEqual({
      taskId: 'task-1',
      candidates: [{ userId: 'u1' }],
    });
    expect(assigneeRecommendationSpec.steps[3]!.input(state, runIn)).toEqual({
      taskId: 'task-1',
      skills: ['a'],
      candidates: [{ userId: 'u1' }],
      availability: [{ userId: 'u1' }],
    });
  });
});
