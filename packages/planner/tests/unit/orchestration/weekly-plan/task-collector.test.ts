import { describe, expect, it } from 'vitest';
import { makeWeeklyPlanTaskCollector } from '../../../../src/backend/orchestration/weekly-plan/agents/task-collector.ts';
import type { PlanWindow } from '../../../../src/backend/orchestration/weekly-plan/schemas.ts';

const WED_FRI: PlanWindow = {
  startDay: 'wed',
  endDay: 'fri',
  weekStart: '2026-07-08',
  weekEnd: '2026-07-10',
};

describe('weeklyPlan taskCollector', () => {
  it('has the right id and returns normalized tasks via the seam', async () => {
    const spec = makeWeeklyPlanTaskCollector({
      resolveModel: () => ({}) as never,
      runAgent: async ({ input }) => {
        expect(input.window).toEqual(WED_FRI);
        return {
          tasks: [
            {
              title: 'Review intern plan',
              priority: 'medium',
              priorityAssumed: true,
              dueAt: null,
              dueAssumed: true,
              overdue: false,
            },
          ],
        };
      },
    });
    expect(spec.id).toBe('planner.weeklyPlan.taskCollector');
    const res = await spec.run(
      { userText: 'plan my week: review intern plan', window: WED_FRI },
      { tenantId: 't1', actorUserId: 'u1' },
    );
    expect(res.result.tasks).toHaveLength(1);
    expect(res.result.tasks[0]!.title).toBe('Review intern plan');
  });

  it('an empty task list is a valid result, not an error', async () => {
    const spec = makeWeeklyPlanTaskCollector({
      resolveModel: () => ({}) as never,
      runAgent: async () => ({ tasks: [] }),
    });
    const res = await spec.run(
      { userText: 'plan my week', window: WED_FRI },
      { tenantId: 't1', actorUserId: 'u1' },
    );
    expect(res.result.tasks).toEqual([]);
    expect(res.trust.confidenceScore).toBeLessThan(0.6);
  });
});
