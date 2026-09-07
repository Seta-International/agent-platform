import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it, vi } from 'vitest';
import { makeAssignTaskTool } from '../../../../src/backend/orchestration/action/assign-task.tool.ts';

const TASK_A = '66be2be2-394d-4184-b106-c412289fd1e1';

function build(
  over: {
    readForAssign?: () => Promise<unknown>;
    assertCanAssign?: () => Promise<void>;
    resolveMembers?: (a: { query: string }) => Promise<unknown[]>;
  } = {},
) {
  const taskAssign = {
    readForAssign: vi.fn(
      over.readForAssign ??
        (async () => ({
          title: 'Deploy hiring screen',
          groupId: 'g1',
          assignees: [{ userId: 'u-b', name: 'Bình' }],
        })),
    ),
    assertCanAssign: vi.fn(over.assertCanAssign ?? (async () => {})),
    resolveMembers: vi.fn(
      over.resolveMembers ??
        (async ({ query }: { query: string }) =>
          query.toLowerCase().includes('tu')
            ? [{ userId: 'u-a', name: 'Tuấn', inGroup: true }]
            : []),
    ),
    assign: vi.fn(async () => ({ replayed: false })),
  };
  const tool = makeAssignTaskTool({
    ports: { taskAssign } as never,
    ctx: { tenantId: 't1', actorUserId: 'a1' } as never,
  });
  return { tool, taskAssign };
}

function rc() {
  const requestContext = new RequestContext();
  requestContext.set('tenant_id', 't1');
  requestContext.set('actor', { type: 'user', user_id: 'a1' });
  return requestContext;
}

function firstPassCtx(suspend: (p: unknown) => Promise<unknown>) {
  return { agent: { suspend, resumeData: undefined }, requestContext: rc() } as never;
}

function resumeCtx(resumeData: unknown) {
  return {
    agent: { suspend: vi.fn(async () => {}), resumeData },
    requestContext: rc(),
  } as never;
}

describe('planner_assignTask — first pass', () => {
  const input = { taskRef: TASK_A, assigneeRefs: ['Tuấn'] } as const;

  it('gates the group before it suspends', async () => {
    const order: string[] = [];
    const { tool, taskAssign } = build();
    taskAssign.assertCanAssign.mockImplementation(async () => {
      order.push('assert');
    });
    const suspend = vi.fn(async () => {
      order.push('suspend');
    });
    await tool.execute!(input as never, firstPassCtx(suspend));
    expect(order).toEqual(['assert', 'suspend']);
  });

  it('suspends with a card whose patch carries the FINAL set', async () => {
    const { tool } = build();
    let suspended: { card?: unknown } | undefined;
    const suspend = vi.fn(async (p: unknown) => {
      suspended = p as { card?: unknown };
    });
    await tool.execute!(input as never, firstPassCtx(suspend));
    const card = suspended?.card as {
      primary: { argsPatch: Record<string, unknown> };
      alternates: unknown[];
    };
    expect(card.primary.argsPatch).toEqual({
      action: 'assign',
      taskId: TASK_A,
      assigneeUserIds: ['u-a'],
      idempotencyKey: expect.any(String),
    });
    // D11 again, from the tool's side.
    expect(card.alternates).toEqual([]);
  });

  it('refuses a name nobody matches, and never suspends', async () => {
    const { tool, taskAssign } = build();
    const suspend = vi.fn(async () => {});
    const out = (await tool.execute!(
      { taskRef: TASK_A, assigneeRefs: ['Nobody'] } as never,
      firstPassCtx(suspend),
    )) as { assigned: boolean; refusal?: string | null };
    expect(out.assigned).toBe(false);
    expect(out.refusal).toMatch(/Nobody/);
    expect(suspend).not.toHaveBeenCalled();
    expect(taskAssign.assign).not.toHaveBeenCalled();
  });

  // Never pick for the user — the same rule the merge and link tools follow.
  it('refuses an ambiguous name and lists who it found', async () => {
    const { tool } = build({
      resolveMembers: async () => [
        { userId: 'u1', name: 'Tuấn Anh', inGroup: true },
        { userId: 'u2', name: 'Tuấn Minh', inGroup: true },
      ],
    });
    const suspend = vi.fn(async () => {});
    const out = (await tool.execute!(input as never, firstPassCtx(suspend))) as {
      refusal?: string | null;
    };
    expect(out.refusal).toMatch(/Tuấn Anh/);
    expect(out.refusal).toMatch(/Tuấn Minh/);
    expect(suspend).not.toHaveBeenCalled();
  });

  it('refuses an unreadable task without saying whether it exists', async () => {
    const { tool, taskAssign } = build({ readForAssign: async () => null });
    const suspend = vi.fn(async () => {});
    const out = (await tool.execute!(input as never, firstPassCtx(suspend))) as {
      refusal?: string | null;
    };
    expect(out.refusal).not.toMatch(/access|permission|forbidden/i);
    expect(taskAssign.assertCanAssign).not.toHaveBeenCalled();
    expect(suspend).not.toHaveBeenCalled();
  });

  it('does not suspend for an actor without assign permission', async () => {
    const { tool } = build({
      assertCanAssign: async () => {
        throw Object.assign(new Error('forbidden'), { code: 'FORBIDDEN' });
      },
    });
    const suspend = vi.fn(async () => {});
    await expect(tool.execute!(input as never, firstPassCtx(suspend))).rejects.toThrow();
    expect(suspend).not.toHaveBeenCalled();
  });

  // The set is already what it would become — a card that changes nothing is
  // noise, and confirming it would burn an idempotency key for no write.
  it('answers instead of previewing when the set is already correct', async () => {
    const { tool } = build({
      readForAssign: async () => ({
        title: 'Deploy hiring screen',
        groupId: 'g1',
        assignees: [{ userId: 'u-a', name: 'Tuấn' }],
      }),
    });
    const suspend = vi.fn(async () => {});
    const out = (await tool.execute!(input as never, firstPassCtx(suspend))) as {
      assigned: boolean;
      refusal?: string | null;
    };
    expect(out.refusal).toMatch(/already/i);
    expect(suspend).not.toHaveBeenCalled();
  });
});

describe('planner_assignTask — resume pass', () => {
  const input = { taskRef: TASK_A, assigneeRefs: ['Tuấn'] } as const;

  it('writes exactly what came off the card', async () => {
    const { tool, taskAssign } = build();
    const out = (await tool.execute!(
      input as never,
      resumeCtx({
        action: 'assign',
        taskId: TASK_A,
        assigneeUserIds: ['u-a', 'u-c'],
        idempotencyKey: 'k1',
      }),
    )) as { assigned: boolean; assigneeUserIds: string[] };
    expect(out.assigned).toBe(true);
    expect(out.assigneeUserIds).toEqual(['u-a', 'u-c']);
    expect(taskAssign.assign).toHaveBeenCalledWith({
      tenantId: 't1',
      actorUserId: 'a1',
      taskId: TASK_A,
      assigneeUserIds: ['u-a', 'u-c'],
      idempotencyKey: 'k1',
    });
  });

  it('decline: no gateway call, so no idempotency row', async () => {
    const { tool, taskAssign } = build();
    const out = (await tool.execute!(
      input as never,
      resumeCtx({ action: 'decline', taskId: TASK_A, idempotencyKey: 'k1' }),
    )) as { assigned: boolean };
    expect(out).toEqual({ assigned: false, assigneeUserIds: [], refusal: null });
    expect(taskAssign.assign).not.toHaveBeenCalled();
  });

  it('never re-reads or re-resolves on resume — the preview is already agreed', async () => {
    const { tool, taskAssign } = build();
    await tool.execute!(
      input as never,
      resumeCtx({
        action: 'assign',
        taskId: TASK_A,
        assigneeUserIds: ['u-a'],
        idempotencyKey: 'k1',
      }),
    );
    expect(taskAssign.readForAssign).not.toHaveBeenCalled();
    expect(taskAssign.resolveMembers).not.toHaveBeenCalled();
  });

  // A card written before this tool shipped, or a truncated payload: refuse,
  // never write something the user did not preview.
  it('refuses an assign payload with no assignees', async () => {
    const { tool, taskAssign } = build();
    const out = (await tool.execute!(
      input as never,
      resumeCtx({ action: 'assign', taskId: TASK_A, idempotencyKey: 'k1' }),
    )) as { assigned: boolean; refusal?: string | null };
    expect(out.assigned).toBe(false);
    expect(out.refusal).toMatch(/again/i);
    expect(taskAssign.assign).not.toHaveBeenCalled();
  });
});
