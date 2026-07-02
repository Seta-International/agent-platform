import { describe, expect, it } from 'vitest';
import {
  makeWeeklyPlanChatStreamer,
  makeWeeklyPlanOrchestrator,
  type WeeklyPlanOrchestratorDeps,
} from '../../../../src/backend/orchestration/weekly-plan/orchestrator.ts';

const trust = { reasoningTrace: [], evidenceCitations: [], confidenceScore: 0.6 };
const stub = (id: string) =>
  ({
    id,
    description: 'stub',
    inputSchema: {} as never,
    outputSchema: {} as never,
    run: async () => ({ result: {} as never, trust }),
  }) as never;

const deps: WeeklyPlanOrchestratorDeps = {
  collector: stub('planner.weeklyPlan.taskCollector'),
  builder: stub('planner.weeklyPlan.scheduleBuilder'),
  insighter: stub('planner.weeklyPlan.insightGenerator'),
  resolveModel: () => ({}) as never,
  now: () => new Date('2026-07-08T09:00:00Z'), // a Wednesday
  streamAgent: ({ message }) => ({
    // The window is resolved deterministically and prefixed onto the message.
    text: Promise.resolve(`window-echo: ${message.slice(0, 120)}`),
  }),
};

describe('weeklyPlan orchestrator', () => {
  it('non-streaming spec resolves the window and answers via the seam', async () => {
    const spec = makeWeeklyPlanOrchestrator(deps);
    expect(spec.id).toBe('planner.weeklyPlan.orchestrator');
    const res = await spec.run(
      { userText: 'plan my week', taskId: null },
      { tenantId: 't1', actorUserId: 'u1' },
    );
    expect(res.result.answer).toContain('window-echo');
    // 'fri' is in every window regardless of the runner's timezone; asserting the
    // exact start day would flake on machines far from UTC.
    expect(res.result.answer).toContain('fri');
  });

  it('streaming entry finalizes to the same answer shape', async () => {
    const startChat = makeWeeklyPlanChatStreamer(deps);
    const run = await startChat(
      { userText: 'plan next week', taskId: null },
      { tenantId: 't1', actorUserId: 'u1' },
    );
    const final = await run.finalize();
    expect((final.result as { answer: string }).answer).toContain('window-echo');
    expect((final.result as { answer: string }).answer).toContain('mon'); // next week starts Monday
  });
});
