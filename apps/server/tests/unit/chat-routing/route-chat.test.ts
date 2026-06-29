import type { ChatStreamRun, RunCtx } from '@seta/shared-orchestration';
import { describe, expect, it, vi } from 'vitest';
import { makeChatRouter } from '../../../src/chat-routing/route-chat.ts';

const fakeRun = (tag: string): ChatStreamRun =>
  ({
    output: { tag } as never,
    finalize: async () => ({ result: { tag }, trust: {} as never }),
  }) as ChatStreamRun;

const ctx: RunCtx = { tenantId: 't1', actorUserId: 'u1' };

describe('chat router dispatch', () => {
  it('dispatches a question to planner_qna', async () => {
    const staffing = vi.fn(async () => fakeRun('staffing'));
    const plannerQna = vi.fn(async () => fakeRun('qna'));
    const router = makeChatRouter({ classify: async () => 'planner_qna', staffing, plannerQna });

    const run = await router({ userText: 'what are my open tasks?', taskId: null }, ctx);
    const final = await run.finalize();

    expect(plannerQna).toHaveBeenCalledOnce();
    expect(staffing).not.toHaveBeenCalled();
    expect((final.result as { tag: string }).tag).toBe('qna');
  });

  it('dispatches an action to staffing', async () => {
    const staffing = vi.fn(async () => fakeRun('staffing'));
    const plannerQna = vi.fn(async () => fakeRun('qna'));
    const router = makeChatRouter({ classify: async () => 'staffing', staffing, plannerQna });

    await router({ userText: 'who should I assign?', taskId: 't-1' }, ctx);

    expect(staffing).toHaveBeenCalledOnce();
    expect(plannerQna).not.toHaveBeenCalled();
  });

  it('forwards runInput and ctx unchanged to the selected runtime', async () => {
    const staffing = vi.fn(async () => fakeRun('staffing'));
    const plannerQna = vi.fn(async () => fakeRun('qna'));
    const router = makeChatRouter({ classify: async () => 'staffing', staffing, plannerQna });

    const runInput = { userText: 'reassign this', taskId: 't-9' };
    await router(runInput, ctx);

    expect(staffing).toHaveBeenCalledWith(runInput, ctx);
  });
});
