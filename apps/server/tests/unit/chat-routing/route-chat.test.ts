import type { ChatStreamRun, RunCtx } from '@seta/shared-orchestration';
import { describe, expect, it, vi } from 'vitest';
import { makeChatRouter } from '../../../src/chat-routing/route-chat.ts';

const fakeRun = (tag: string): ChatStreamRun =>
  ({
    output: { tag } as never,
    finalize: async () => ({ result: { tag }, trust: {} as never }),
  }) as ChatStreamRun;

const ctx: RunCtx = { tenantId: 't1', actorUserId: 'u1' };

const makeDeps = () => ({
  assignment: vi.fn(async () => fakeRun('assignment')),
  plannerQna: vi.fn(async () => fakeRun('qna')),
  weeklyPlanner: vi.fn(async () => fakeRun('weekly')),
});

describe('chat router dispatch', () => {
  it('dispatches a question to planner_qna', async () => {
    const deps = makeDeps();
    const router = makeChatRouter({ classify: async () => 'planner_qna', ...deps });

    const run = await router({ userText: 'what are my open tasks?', taskId: null }, ctx);
    const final = await run.finalize();

    expect(deps.plannerQna).toHaveBeenCalledOnce();
    expect(deps.assignment).not.toHaveBeenCalled();
    expect(deps.weeklyPlanner).not.toHaveBeenCalled();
    expect((final.result as { tag: string }).tag).toBe('qna');
  });

  it('dispatches an action to assignment', async () => {
    const deps = makeDeps();
    const router = makeChatRouter({ classify: async () => 'assignment', ...deps });

    await router({ userText: 'who should I assign?', taskId: 't-1' }, ctx);

    expect(deps.assignment).toHaveBeenCalledOnce();
    expect(deps.plannerQna).not.toHaveBeenCalled();
    expect(deps.weeklyPlanner).not.toHaveBeenCalled();
  });

  it('dispatches a planning request to weekly_planner', async () => {
    const deps = makeDeps();
    const router = makeChatRouter({ classify: async () => 'weekly_planner', ...deps });

    const run = await router({ userText: 'plan my week', taskId: null }, ctx);
    const final = await run.finalize();

    expect(deps.weeklyPlanner).toHaveBeenCalledOnce();
    expect(deps.assignment).not.toHaveBeenCalled();
    expect(deps.plannerQna).not.toHaveBeenCalled();
    expect((final.result as { tag: string }).tag).toBe('weekly');
  });

  it('forwards runInput and ctx unchanged to the selected runtime', async () => {
    const deps = makeDeps();
    const router = makeChatRouter({ classify: async () => 'assignment', ...deps });

    const runInput = { userText: 'reassign this', taskId: 't-9' };
    await router(runInput, ctx);

    expect(deps.assignment).toHaveBeenCalledWith(runInput, ctx);
  });
});
