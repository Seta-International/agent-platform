import type { ChatStreamRun, RunCtx } from '@seta/shared-orchestration';
import { describe, expect, it, vi } from 'vitest';
import type { ChatIntent } from '../../../src/chat-routing/intent-classifier.ts';
import { makeChatRouter } from '../../../src/chat-routing/route-chat.ts';

const fakeRun = (tag: string): ChatStreamRun =>
  ({
    output: { tag } as never,
    finalize: async () => ({ result: { tag }, trust: {} as never }),
  }) as ChatStreamRun;

const ctx: RunCtx = { tenantId: 't1', actorUserId: 'u1' };

const makeDeps = () => ({
  assignment: vi.fn(async () => fakeRun('assignment')),
  plannerQuery: vi.fn(async () => fakeRun('qna')),
  weeklyPlanner: vi.fn(async () => fakeRun('weekly')),
  action: vi.fn(async () => fakeRun('action')),
  // FUT-840: A2 always receives an openPreview; these pre-existing cases are
  // about dispatch, so nothing is open.
  findOpenPreview: vi.fn(async () => null),
});

describe('chat router dispatch', () => {
  it('dispatches a question to planner_qna', async () => {
    const deps = makeDeps();
    const router = makeChatRouter({ classify: async () => 'planner_qna', ...deps });

    const run = await router({ userText: 'what are my open tasks?', taskId: null }, ctx);
    const final = await run.finalize();

    expect(deps.plannerQuery).toHaveBeenCalledOnce();
    expect(deps.assignment).not.toHaveBeenCalled();
    expect(deps.weeklyPlanner).not.toHaveBeenCalled();
    expect((final.result as { tag: string }).tag).toBe('qna');
  });

  it('dispatches an action to assignment', async () => {
    const deps = makeDeps();
    const router = makeChatRouter({ classify: async () => 'assignment', ...deps });

    await router({ userText: 'who should I assign?', taskId: 't-1' }, ctx);

    expect(deps.assignment).toHaveBeenCalledOnce();
    expect(deps.plannerQuery).not.toHaveBeenCalled();
    expect(deps.weeklyPlanner).not.toHaveBeenCalled();
  });

  it('dispatches a planning request to weekly_planner', async () => {
    const deps = makeDeps();
    const router = makeChatRouter({ classify: async () => 'weekly_planner', ...deps });

    const run = await router({ userText: 'plan my week', taskId: null }, ctx);
    const final = await run.finalize();

    expect(deps.weeklyPlanner).toHaveBeenCalledOnce();
    expect(deps.assignment).not.toHaveBeenCalled();
    expect(deps.plannerQuery).not.toHaveBeenCalled();
    expect((final.result as { tag: string }).tag).toBe('weekly');
  });

  it('dispatches the mutate intent to the action runtime', async () => {
    const deps = makeDeps();
    const router = makeChatRouter({ classify: async () => 'mutate', ...deps });

    const run = await router({ userText: 'đổi hạn task Alpha', taskId: null }, ctx);
    const final = await run.finalize();

    expect(deps.action).toHaveBeenCalledOnce();
    expect(deps.assignment).not.toHaveBeenCalled();
    expect(deps.plannerQuery).not.toHaveBeenCalled();
    expect(deps.weeklyPlanner).not.toHaveBeenCalled();
    expect((final.result as { tag: string }).tag).toBe('action');
  });

  it('forwards runInput and ctx unchanged to the selected runtime', async () => {
    const deps = makeDeps();
    const router = makeChatRouter({ classify: async () => 'assignment', ...deps });

    const runInput = { userText: 'reassign this', taskId: 't-9' };
    await router(runInput, ctx);

    expect(deps.assignment).toHaveBeenCalledWith(runInput, ctx);
  });
});

describe('makeChatRouter — the open preview reaches A2 (FUT-840)', () => {
  const openPreview = {
    approvalId: '7f3a1c2e-1111-4222-8333-444455556666',
    toolId: 'planner_updateTask',
    intent: 'Update "Deploy API"',
    taskIds: ['66be2be2-394d-4184-b106-c412289fd1e1'],
    proposedRows: [{ k: 'Due', v: '12 Aug 2026 → 21 Aug 2026' }],
  };

  function deps(over: { intent?: ChatIntent; preview?: typeof openPreview | null } = {}) {
    const action = vi.fn(async () => fakeRun('action'));
    const assignment = vi.fn(async () => fakeRun('assignment'));
    const plannerQuery = vi.fn(async () => fakeRun('qna'));
    const weeklyPlanner = vi.fn(async () => fakeRun('weekly'));
    const findOpenPreview = vi.fn(async () => over.preview ?? null);
    const router = makeChatRouter({
      classify: async () => over.intent ?? 'mutate',
      action,
      assignment,
      plannerQuery,
      weeklyPlanner,
      findOpenPreview,
    });
    return { router, action, assignment, plannerQuery, weeklyPlanner, findOpenPreview };
  }

  const threadCtx = { tenantId: 't1', actorUserId: 'a1', threadId: 'thread-1' } as RunCtx;

  it('forwards the open preview into the action orchestrator', async () => {
    const { router, action, findOpenPreview } = deps({ preview: openPreview });
    await router({ userText: 'make it next Friday', taskId: null }, threadCtx);
    expect(findOpenPreview).toHaveBeenCalledWith({
      tenantId: 't1',
      actorUserId: 'a1',
      threadId: 'thread-1',
    });
    expect(action).toHaveBeenCalledWith(
      { userText: 'make it next Friday', taskId: null, openPreview },
      threadCtx,
    );
  });

  it('passes openPreview: null when nothing is open, so A2 treats the turn as new', async () => {
    const { router, action } = deps({ preview: null });
    await router({ userText: 'make it next Friday', taskId: null }, threadCtx);
    expect(action).toHaveBeenCalledWith(
      { userText: 'make it next Friday', taskId: null, openPreview: null },
      threadCtx,
    );
  });

  it('does not look up a preview outside a thread', async () => {
    const { router, action, findOpenPreview } = deps({ preview: openPreview });
    await router({ userText: 'make it next Friday', taskId: null }, {
      tenantId: 't1',
      actorUserId: 'a1',
    } as RunCtx);
    expect(findOpenPreview).not.toHaveBeenCalled();
    expect(action).toHaveBeenCalledWith(
      { userText: 'make it next Friday', taskId: null, openPreview: null },
      expect.anything(),
    );
  });

  it.each(['assignment', 'planner_qna', 'weekly_planner'] as const)(
    'does not pay for the lookup on a %s turn',
    async (intent) => {
      const { router, findOpenPreview } = deps({ intent, preview: openPreview });
      await router({ userText: 'who should do this?', taskId: null }, threadCtx);
      // Classification is text-only and never reads the preview (design D12), so
      // the lookup is worth paying for on mutate turns only.
      expect(findOpenPreview).not.toHaveBeenCalled();
    },
  );

  it('leaves the other three orchestrators on the NARROW input', async () => {
    const { router, assignment } = deps({ intent: 'assignment', preview: openPreview });
    await router({ userText: 'who should do this?', taskId: null }, threadCtx);
    expect(assignment).toHaveBeenCalledWith(
      { userText: 'who should do this?', taskId: null },
      threadCtx,
    );
  });

  it('does not break the turn when the lookup fails', async () => {
    const action = vi.fn(async () => fakeRun('action'));
    const router = makeChatRouter({
      classify: async () => 'mutate',
      action,
      assignment: vi.fn() as never,
      plannerQuery: vi.fn() as never,
      weeklyPlanner: vi.fn() as never,
      findOpenPreview: async () => {
        throw new Error('read-model unavailable');
      },
    });
    // A read-model read failure must degrade to "no preview open" — the user's
    // sentence still reaches A2, which asks which task they mean, instead of the
    // whole turn 500ing.
    await router({ userText: 'make it next Friday', taskId: null }, threadCtx);
    expect(action).toHaveBeenCalledWith(
      { userText: 'make it next Friday', taskId: null, openPreview: null },
      threadCtx,
    );
  });
});
