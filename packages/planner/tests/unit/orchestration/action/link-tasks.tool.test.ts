import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it, vi } from 'vitest';
import { makeLinkTasksTool } from '../../../../src/backend/orchestration/action/link-tasks.tool.ts';

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
    version: 1,
    groupId,
  };
}

function build(
  over: {
    readEndpoint?: (a: { taskId: string }) => Promise<unknown>;
    assertCanLink?: () => Promise<void>;
    linkExists?: () => Promise<boolean>;
  } = {},
) {
  const taskLink = {
    readEndpoint: vi.fn(
      over.readEndpoint ??
        (async ({ taskId }: { taskId: string }) =>
          snap(taskId, taskId === TASK_A ? 'Alpha' : 'Beta')),
    ),
    assertCanLink: vi.fn(over.assertCanLink ?? (async () => {})),
    linkExists: vi.fn(over.linkExists ?? (async () => false)),
    link: vi.fn(async () => ({ linkId: 'l1', replayed: false })),
  };
  const tool = makeLinkTasksTool({
    ports: { taskLink } as never,
    ctx: { tenantId: 't1', actorUserId: 'a1' } as never,
  });
  return { tool, taskLink };
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

describe('planner_linkTasks — first pass', () => {
  const input = { sourceTaskRef: TASK_A, targetTaskRef: TASK_B, kind: 'relates' } as const;

  it('gates both groups before it suspends', async () => {
    const order: string[] = [];
    const { tool, taskLink } = build();
    taskLink.assertCanLink.mockImplementation(async () => {
      order.push('assert');
    });
    const suspend = vi.fn(async () => {
      order.push('suspend');
    });
    await tool.execute!(input as never, firstPassCtx(suspend));
    expect(order).toEqual(['assert', 'suspend']);
  });

  it('refuses an unreadable OR absent endpoint identically, and never suspends', async () => {
    const { tool, taskLink } = build({ readEndpoint: async () => null });
    const suspend = vi.fn(async () => {});
    const out = (await tool.execute!(input as never, firstPassCtx(suspend))) as {
      linked: boolean;
      refusal?: string | null;
    };
    expect(out.linked).toBe(false);
    expect(out.refusal).toBe(`I can't find a task called "${TASK_A}".`);
    expect(out.refusal).not.toMatch(/access|permission/i);
    expect(taskLink.assertCanLink).not.toHaveBeenCalled();
    expect(suspend).not.toHaveBeenCalled();
  });

  // Before the card, not at Confirm: a card that fails on the button is worse
  // than an answer.
  it('answers "already linked" instead of building a card that would fail', async () => {
    const { tool } = build({ linkExists: async () => true });
    const suspend = vi.fn(async () => {});
    const out = (await tool.execute!(input as never, firstPassCtx(suspend))) as {
      linked: boolean;
      refusal?: string | null;
    };
    expect(out.linked).toBe(false);
    expect(out.refusal).toMatch(/already/i);
    expect(suspend).not.toHaveBeenCalled();
  });

  it('refuses linking a task to itself', async () => {
    const { tool, taskLink } = build();
    const suspend = vi.fn(async () => {});
    const out = (await tool.execute!(
      { ...input, targetTaskRef: TASK_A } as never,
      firstPassCtx(suspend),
    )) as { refusal?: string | null };
    expect(out.refusal).toMatch(/same task/i);
    expect(taskLink.readEndpoint).not.toHaveBeenCalled();
  });

  it('suspends with a card whose argsPatch carries both ids, the kind and a key', async () => {
    const { tool } = build();
    let suspended: { card?: unknown } | undefined;
    const suspend = vi.fn(async (p: unknown) => {
      suspended = p as { card?: unknown };
    });
    await tool.execute!(input as never, firstPassCtx(suspend));
    const card = suspended?.card as { primary: { argsPatch: Record<string, unknown> } };
    expect(card.primary.argsPatch).toEqual({
      action: 'link',
      sourceTaskId: TASK_A,
      targetTaskId: TASK_B,
      kind: 'relates',
      idempotencyKey: expect.any(String),
    });
  });

  it('does not suspend for an actor missing update on one side', async () => {
    const { tool } = build({
      assertCanLink: async () => {
        throw Object.assign(new Error('forbidden'), { code: 'FORBIDDEN' });
      },
    });
    const suspend = vi.fn(async () => {});
    await expect(tool.execute!(input as never, firstPassCtx(suspend))).rejects.toThrow();
    expect(suspend).not.toHaveBeenCalled();
  });
});

describe('planner_linkTasks — resume pass', () => {
  const input = { sourceTaskRef: TASK_A, targetTaskRef: TASK_B, kind: 'relates' } as const;

  function resumeCtx(resumeData: unknown) {
    const suspend = vi.fn(async () => {});
    return { agent: { suspend, resumeData }, requestContext: rc() } as never;
  }

  it('writes with exactly what came off the card', async () => {
    const { tool, taskLink } = build();
    const out = (await tool.execute!(
      input as never,
      resumeCtx({
        action: 'link',
        sourceTaskId: TASK_A,
        targetTaskId: TASK_B,
        kind: 'duplicates',
        idempotencyKey: 'k1',
      }),
    )) as { linked: boolean };
    expect(out.linked).toBe(true);
    expect(taskLink.link).toHaveBeenCalledWith({
      tenantId: 't1',
      actorUserId: 'a1',
      sourceTaskId: TASK_A,
      targetTaskId: TASK_B,
      kind: 'duplicates',
      idempotencyKey: 'k1',
    });
  });

  it('decline: no gateway call, so no idempotency row is written', async () => {
    const { tool, taskLink } = build();
    const out = (await tool.execute!(
      input as never,
      resumeCtx({
        action: 'decline',
        sourceTaskId: TASK_A,
        targetTaskId: TASK_B,
        kind: 'relates',
      }),
    )) as { linked: boolean };
    expect(out).toEqual({ linked: false, linkId: null, refusal: null });
    expect(taskLink.link).not.toHaveBeenCalled();
  });

  it('never re-reads on resume — the preview is already agreed', async () => {
    const { tool, taskLink } = build();
    await tool.execute!(
      input as never,
      resumeCtx({
        action: 'link',
        sourceTaskId: TASK_A,
        targetTaskId: TASK_B,
        kind: 'relates',
        idempotencyKey: 'k1',
      }),
    );
    expect(taskLink.readEndpoint).not.toHaveBeenCalled();
  });
});
