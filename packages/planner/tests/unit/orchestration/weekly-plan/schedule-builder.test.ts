import { describe, expect, it, vi } from 'vitest';
import { makeWeeklyPlanScheduleBuilder } from '../../../../src/backend/orchestration/weekly-plan/agents/schedule-builder.ts';
import type {
  NormalizedTask,
  PlanWindow,
  WeeklyPlan,
} from '../../../../src/backend/orchestration/weekly-plan/schemas.ts';

const WED_FRI: PlanWindow = {
  startDay: 'Wednesday',
  endDay: 'Friday',
  weekStart: '2026-07-08',
  weekEnd: '2026-07-10',
};

const task = (over: Partial<NormalizedTask> & { title: string }): NormalizedTask => ({
  priority: 'medium',
  priorityAssumed: false,
  dueAt: null,
  dueAssumed: false,
  overdue: false,
  ...over,
});

const tasks = [task({ title: 'A', dueAt: '2026-07-09' }), task({ title: 'B' })];

const validPlan: WeeklyPlan = {
  days: [
    { day: 'Wednesday', blocks: [{ label: 'Focus', taskTitles: ['A'] }] },
    { day: 'Thursday', blocks: [{ label: 'Focus', taskTitles: ['B'] }] },
  ],
  unplaced: [],
};

const invalidPlan: WeeklyPlan = {
  days: [{ day: 'Monday', blocks: [{ label: 'Focus', taskTitles: ['A', 'B'] }] }],
  unplaced: [],
};

const ctx = { tenantId: 't1', actorUserId: 'u1' } as const;

describe('weeklyPlan scheduleBuilder', () => {
  it('returns a valid LLM plan with no caveat', async () => {
    const generatePlan = vi.fn(async () => validPlan);
    const spec = makeWeeklyPlanScheduleBuilder({ resolveModel: () => ({}) as never, generatePlan });
    const res = await spec.run({ tasks, window: WED_FRI }, ctx);
    expect(res.result.plan).toEqual(validPlan);
    expect(res.result.caveat).toBeNull();
    expect(generatePlan).toHaveBeenCalledOnce();
  });

  it('repairs once: invalid then valid → valid plan, violations fed to the retry', async () => {
    const generatePlan = vi
      .fn()
      .mockResolvedValueOnce(invalidPlan)
      .mockResolvedValueOnce(validPlan);
    const spec = makeWeeklyPlanScheduleBuilder({ resolveModel: () => ({}) as never, generatePlan });
    const res = await spec.run({ tasks, window: WED_FRI }, ctx);
    expect(res.result.plan).toEqual(validPlan);
    expect(res.result.caveat).toBeNull();
    expect(generatePlan).toHaveBeenCalledTimes(2);
    const retryArgs = generatePlan.mock.calls[1]![0] as { message: string };
    expect(retryArgs.message).toContain('outside the planning window');
  });

  it('falls back deterministically after two invalid plans, with a caveat', async () => {
    const generatePlan = vi.fn(async () => invalidPlan);
    const spec = makeWeeklyPlanScheduleBuilder({ resolveModel: () => ({}) as never, generatePlan });
    const res = await spec.run({ tasks, window: WED_FRI }, ctx);
    expect(generatePlan).toHaveBeenCalledTimes(2);
    expect(res.result.caveat).toContain('deterministic');
    // Fallback still places every task inside the window.
    const placed = res.result.plan.days.flatMap((d) => d.blocks.flatMap((b) => b.taskTitles));
    expect(placed.sort()).toEqual(['A', 'B']);
    expect(
      res.result.plan.days.every((d) => ['Wednesday', 'Thursday', 'Friday'].includes(d.day)),
    ).toBe(true);
  });

  it('empty task list → empty plan, no LLM call', async () => {
    const generatePlan = vi.fn(async () => validPlan);
    const spec = makeWeeklyPlanScheduleBuilder({ resolveModel: () => ({}) as never, generatePlan });
    const res = await spec.run({ tasks: [], window: WED_FRI }, ctx);
    expect(res.result.plan).toEqual({ days: [], unplaced: [] });
    expect(generatePlan).not.toHaveBeenCalled();
  });
});
