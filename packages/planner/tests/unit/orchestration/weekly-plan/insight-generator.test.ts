import { describe, expect, it } from 'vitest';
import { makeWeeklyPlanInsightGenerator } from '../../../../src/backend/orchestration/weekly-plan/agents/insight-generator.ts';
import type {
  NormalizedTask,
  WeeklyPlan,
} from '../../../../src/backend/orchestration/weekly-plan/schemas.ts';

const task = (over: Partial<NormalizedTask> & { title: string }): NormalizedTask => ({
  priority: 'medium',
  priorityAssumed: false,
  dueAt: null,
  dueAssumed: false,
  overdue: false,
  ...over,
});

const plan: WeeklyPlan = {
  days: [{ day: 'wed', blocks: [{ label: 'Focus', taskTitles: ['A'] }] }],
  unplaced: [],
};

const ctx = { tenantId: 't1', actorUserId: 'u1' } as const;

describe('weeklyPlan insightGenerator', () => {
  it('passes LLM insights through (capped at 3)', async () => {
    const spec = makeWeeklyPlanInsightGenerator({
      resolveModel: () => ({}) as never,
      generateInsights: async () => ({
        insights: [
          { kind: 'focus', text: 'Deep work reserved.' },
          { kind: 'workload', text: 'Even spread.' },
          { kind: 'risk', text: 'KPI module is big.' },
          { kind: 'focus', text: 'fourth — dropped' },
        ],
      }),
    });
    const res = await spec.run({ plan, tasks: [task({ title: 'A' })] }, ctx);
    expect(res.result.insights).toHaveLength(3);
  });

  it('zero LLM insights → synthesized workload insight (≥1 guaranteed)', async () => {
    const spec = makeWeeklyPlanInsightGenerator({
      resolveModel: () => ({}) as never,
      generateInsights: async () => ({ insights: [] }),
    });
    const res = await spec.run({ plan, tasks: [task({ title: 'A' })] }, ctx);
    expect(res.result.insights).toHaveLength(1);
    expect(res.result.insights[0]!.kind).toBe('workload');
  });

  it('overdue tasks force a risk insight when the LLM produced none', async () => {
    const spec = makeWeeklyPlanInsightGenerator({
      resolveModel: () => ({}) as never,
      generateInsights: async () => ({
        insights: [{ kind: 'workload', text: 'Even spread.' }],
      }),
    });
    const res = await spec.run(
      { plan, tasks: [task({ title: 'A', dueAt: '2026-07-01', overdue: true })] },
      ctx,
    );
    expect(res.result.insights[0]!.kind).toBe('risk');
    expect(res.result.insights[0]!.text).toContain('A');
  });
});
