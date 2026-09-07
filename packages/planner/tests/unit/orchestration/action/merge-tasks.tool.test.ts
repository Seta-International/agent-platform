import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it, vi } from 'vitest';
import { makeMergeTasksTool } from '../../../../src/backend/orchestration/action/merge-tasks.tool.ts';

const TASK_A = '66be2be2-394d-4184-b106-c412289fd1e1';
const TASK_B = '9f1d3a10-2b44-4c55-8d66-ee7788990011';

function snap(taskId: string, title: string, groupId = 'g1') {
  return {
    taskId,
    title,
    description: null,
    due_at: null,
    start_at: null,
    priority_number: 5 as const,
    percent_complete: 0,
    version: 3,
    groupId,
  };
}

function build(
  over: {
    readEndpoint?: (a: { taskId: string }) => Promise<unknown>;
    assertCanMerge?: () => Promise<void>;
  } = {},
) {
  const taskLink = {
    readEndpoint: vi.fn(
      over.readEndpoint ??
        (async ({ taskId }: { taskId: string }) =>
          snap(taskId, taskId === TASK_A ? 'Draft doc' : 'Doc')),
    ),
    // Merge runs its own three-check gate; the link-only gate must not also fire.
    assertCanLink: vi.fn(async () => {}),
    readPairLink: vi.fn(async () => null),
    link: vi.fn(async () => ({ linkId: 'l1', replayed: false })),
  };
  const taskMerge = {
    assertCanMerge: vi.fn(over.assertCanMerge ?? (async () => {})),
    merge: vi.fn(async () => ({ replayed: false })),
  };
  const tool = makeMergeTasksTool({
    ports: { taskLink, taskMerge } as never,
    ctx: { tenantId: 't1', actorUserId: 'a1' } as never,
  });
  return { tool, taskLink, taskMerge };
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

describe('planner_mergeTasks — first pass', () => {
  const input = { duplicateTaskRef: TASK_A, keepTaskRef: TASK_B } as const;

  it('gates update-on-both plus delete-on-the-duplicate before suspending', async () => {
    const order: string[] = [];
    const { tool, taskMerge } = build();
    taskMerge.assertCanMerge.mockImplementation(async () => {
      order.push('assert');
    });
    const suspend = vi.fn(async () => {
      order.push('suspend');
    });
    await tool.execute!(input as never, firstPassCtx(suspend));
    expect(order).toEqual(['assert', 'suspend']);
    expect(taskMerge.assertCanMerge).toHaveBeenCalledWith({
      tenantId: 't1',
      actorUserId: 'a1',
      duplicateGroupId: 'g1',
      keepGroupId: 'g1',
    });
  });

  it('refuses merging a task into itself', async () => {
    const { tool, taskMerge } = build();
    const suspend = vi.fn(async () => {});
    const out = (await tool.execute!(
      { duplicateTaskRef: TASK_A, keepTaskRef: TASK_A } as never,
      firstPassCtx(suspend),
    )) as { merged: boolean; refusal?: string | null };
    expect(out.merged).toBe(false);
    expect(out.refusal).toMatch(/same task/i);
    expect(taskMerge.assertCanMerge).not.toHaveBeenCalled();
    expect(suspend).not.toHaveBeenCalled();
  });

  it('refuses an unresolvable endpoint with the same sentence link uses', async () => {
    const { tool, taskMerge } = build({ readEndpoint: async () => null });
    const suspend = vi.fn(async () => {});
    const out = (await tool.execute!(input as never, firstPassCtx(suspend))) as {
      refusal?: string | null;
    };
    expect(out.refusal).toBe(`I can't find a task called "${TASK_A}".`);
    expect(taskMerge.assertCanMerge).not.toHaveBeenCalled();
    expect(suspend).not.toHaveBeenCalled();
  });

  it('never merges without a Confirm — the first pass writes nothing', async () => {
    const { tool, taskMerge } = build();
    await tool.execute!(input as never, firstPassCtx(vi.fn(async () => {})));
    expect(taskMerge.merge).not.toHaveBeenCalled();
  });

  it('captures the duplicate’s version on the card, and no keeper version', async () => {
    const { tool } = build();
    let suspended: { card?: unknown } | undefined;
    const suspend = vi.fn(async (p: unknown) => {
      suspended = p as { card?: unknown };
    });
    await tool.execute!(input as never, firstPassCtx(suspend));
    const card = suspended?.card as {
      riskBadge: string;
      primary: { argsPatch: Record<string, unknown> };
    };
    expect(card.riskBadge).toBe('destructive');
    expect(card.primary.argsPatch).toEqual({
      action: 'merge',
      duplicateTaskId: TASK_A,
      duplicateExpectedVersion: 3,
      keepTaskId: TASK_B,
      idempotencyKey: expect.any(String),
    });
  });
});

describe('planner_mergeTasks — resume pass', () => {
  const input = { duplicateTaskRef: TASK_A, keepTaskRef: TASK_B } as const;

  function resumeCtx(resumeData: unknown) {
    return {
      agent: { suspend: vi.fn(async () => {}), resumeData },
      requestContext: rc(),
    } as never;
  }

  it('merges with exactly what came off the card', async () => {
    const { tool, taskMerge } = build();
    const out = (await tool.execute!(
      input as never,
      resumeCtx({
        action: 'merge',
        duplicateTaskId: TASK_A,
        duplicateExpectedVersion: 3,
        keepTaskId: TASK_B,
        idempotencyKey: 'k1',
      }),
    )) as { merged: boolean; keptTaskId: string | null };
    expect(out).toMatchObject({ merged: true, keptTaskId: TASK_B });
    expect(taskMerge.merge).toHaveBeenCalledWith({
      tenantId: 't1',
      actorUserId: 'a1',
      duplicateTaskId: TASK_A,
      duplicateExpectedVersion: 3,
      keepTaskId: TASK_B,
      idempotencyKey: 'k1',
    });
  });

  it('decline: nothing is trashed and no idempotency row is written', async () => {
    const { tool, taskMerge } = build();
    const out = (await tool.execute!(
      input as never,
      resumeCtx({
        action: 'decline',
        duplicateTaskId: TASK_A,
        duplicateExpectedVersion: 3,
        keepTaskId: TASK_B,
      }),
    )) as { merged: boolean };
    expect(out).toEqual({ merged: false, keptTaskId: null, refusal: null });
    expect(taskMerge.merge).not.toHaveBeenCalled();
  });

  it('never re-reads or re-gates on resume — the preview is already agreed', async () => {
    const { tool, taskLink, taskMerge } = build();
    await tool.execute!(
      input as never,
      resumeCtx({
        action: 'merge',
        duplicateTaskId: TASK_A,
        duplicateExpectedVersion: 3,
        keepTaskId: TASK_B,
        idempotencyKey: 'k1',
      }),
    );
    expect(taskLink.readEndpoint).not.toHaveBeenCalled();
    expect(taskMerge.assertCanMerge).not.toHaveBeenCalled();
  });
});
