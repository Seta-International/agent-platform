import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it, vi } from 'vitest';
import { makeLinkTasksTool } from '../../../../src/backend/orchestration/action/link-tasks.tool.ts';
import {
  fakePreviewPort,
  injectedPreview,
  OPEN_APPROVAL_ID,
  runFirstPass,
} from './revision-test-kit.ts';

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
    readPairLink?: () => Promise<{ kind: string; direction: 'outgoing' | 'incoming' } | null>;
  } = {},
) {
  const taskLink = {
    readEndpoint: vi.fn(
      over.readEndpoint ??
        (async ({ taskId }: { taskId: string }) =>
          snap(taskId, taskId === TASK_A ? 'Alpha' : 'Beta')),
    ),
    assertCanLink: vi.fn(over.assertCanLink ?? (async () => {})),
    readPairLink: vi.fn(over.readPairLink ?? (async () => null)),
    link: vi.fn(async () => ({ linkId: 'l1', replayed: false })),
  };
  // Every first pass now consults the preview port on the NEW-card path
  // (FUT-840), so the default fake answers "nothing open, nothing taken".
  const preview = fakePreviewPort({ taken: [] });
  const tool = makeLinkTasksTool({
    ports: { taskLink, preview } as never,
    ctx: { tenantId: 't1', actorUserId: 'a1' } as never,
  });
  return { tool, taskLink, preview };
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
  // than an answer. Three outcomes, three sentences, none of them suspends.
  it('answers "already linked" instead of building a card that would fail', async () => {
    const { tool } = build({
      readPairLink: async () => ({ kind: 'relates', direction: 'outgoing' }),
    });
    const suspend = vi.fn(async () => {});
    const out = (await tool.execute!(input as never, firstPassCtx(suspend))) as {
      linked: boolean;
      refusal?: string | null;
    };
    expect(out.linked).toBe(false);
    expect(out.refusal).toMatch(/already linked/i);
    expect(suspend).not.toHaveBeenCalled();
  });

  it('says so when the same link exists in the other direction', async () => {
    const { tool } = build({
      readPairLink: async () => ({ kind: 'relates', direction: 'incoming' }),
    });
    const suspend = vi.fn(async () => {});
    const out = (await tool.execute!(input as never, firstPassCtx(suspend))) as {
      refusal?: string | null;
    };
    expect(out.refusal).toMatch(/other direction/i);
    expect(suspend).not.toHaveBeenCalled();
  });

  // D8 through the tool: a pair holds ONE kind, so a kind change is refused
  // NAMING the relationship that is there — the tool never rewrites one it did
  // not create.
  it('names the existing kind when the pair already carries a different one', async () => {
    const { tool } = build({
      readPairLink: async () => ({ kind: 'duplicates', direction: 'outgoing' }),
    });
    const suspend = vi.fn(async () => {});
    const out = (await tool.execute!(input as never, firstPassCtx(suspend))) as {
      refusal?: string | null;
    };
    expect(out.refusal).toMatch(/duplicate/i);
    expect(out.refusal).toMatch(/remove/i);
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

describe('planner_linkTasks — the revision branch (FUT-840)', () => {
  const OPEN_ID = OPEN_APPROVAL_ID;
  const THIRD_TASK = '11112222-3333-4444-8555-666677778888';
  const openArgsPatch = {
    action: 'link',
    sourceTaskId: TASK_A,
    targetTaskId: TASK_B,
    kind: 'relates',
    idempotencyKey: 'old-key',
  };

  function buildRev(
    over: {
      loaded?: { approvalId: string; toolId: string; argsPatch: Record<string, unknown> } | null;
      taken?: string[];
      openPreview?: ReturnType<typeof injectedPreview> | null;
      assertCanLink?: () => Promise<void>;
      readPairLink?: () => Promise<{ kind: string; direction: 'outgoing' | 'incoming' } | null>;
      readEndpoint?: (a: { taskId: string }) => Promise<unknown>;
    } = {},
  ) {
    const taskLink = {
      readEndpoint: vi.fn(
        over.readEndpoint ??
          (async ({ taskId }: { taskId: string }) =>
            snap(taskId, taskId === TASK_A ? 'Alpha' : 'Beta', taskId === TASK_A ? 'g1' : 'g2')),
      ),
      assertCanLink: vi.fn(over.assertCanLink ?? (async (_a: { groupIds: string[] }) => {})),
      readPairLink: vi.fn(over.readPairLink ?? (async () => null)),
      link: vi.fn(async () => ({ linkId: 'l1', replayed: false })),
    };
    const preview = fakePreviewPort({
      loaded:
        over.loaded === undefined
          ? { approvalId: OPEN_ID, toolId: 'planner_linkTasks', argsPatch: openArgsPatch }
          : over.loaded,
      ...(over.taken ? { taken: over.taken } : {}),
    });
    const tool = makeLinkTasksTool({
      ports: { taskLink, preview } as never,
      ctx: { tenantId: 't1', actorUserId: 'a1' } as never,
      openPreview: over.openPreview === undefined ? injectedPreview() : over.openPreview,
    });
    return { tool, taskLink, preview };
  }

  it('changes only the kind, keeping BOTH endpoints from the card', async () => {
    // "Link A to C instead of B" is a NEW request: it collides with design D5 (a
    // sentence naming a different task) and with AC5 (an adjustment never widens
    // the change). Ignoring the refs can only ever narrow, so it is safe.
    const { tool } = buildRev();
    const { card } = await runFirstPass(tool, {
      sourceTaskRef: TASK_A,
      targetTaskRef: THIRD_TASK,
      kind: 'blocks',
      revisionOf: OPEN_ID,
    });
    expect(card?.primary.argsPatch).toEqual({
      action: 'link',
      sourceTaskId: TASK_A,
      targetTaskId: TASK_B,
      kind: 'blocks',
      idempotencyKey: expect.any(String),
    });
  });

  it('re-gates BOTH groups before suspending (AC5.2)', async () => {
    const { tool, taskLink } = buildRev({
      assertCanLink: async () => {
        throw Object.assign(new Error('forbidden'), { code: 'FORBIDDEN' });
      },
    });
    const suspend = vi.fn(async () => {});
    await expect(
      tool.execute!(
        {
          sourceTaskRef: TASK_A,
          targetTaskRef: TASK_B,
          kind: 'blocks',
          revisionOf: OPEN_ID,
        } as never,
        firstPassCtx(suspend),
      ),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(suspend).not.toHaveBeenCalled();
    expect(taskLink.assertCanLink.mock.calls[0]![0]).toMatchObject({ groupIds: ['g1', 'g2'] });
  });

  it('still refuses a pair that already carries a relationship', async () => {
    const { tool } = buildRev({
      readPairLink: async () => ({ kind: 'duplicates', direction: 'outgoing' }),
    });
    const { out, suspend } = await runFirstPass(tool, {
      sourceTaskRef: TASK_A,
      targetTaskRef: TASK_B,
      kind: 'blocks',
      revisionOf: OPEN_ID,
    });
    expect(suspend).not.toHaveBeenCalled();
    expect(out.refusal).toMatch(/duplicates of each other/i);
  });

  it('mints a fresh idempotency key and stamps meta.supersedes', async () => {
    const { tool } = buildRev();
    const { card } = await runFirstPass(tool, {
      sourceTaskRef: TASK_A,
      targetTaskRef: TASK_B,
      kind: 'blocks',
      revisionOf: OPEN_ID,
    });
    expect(card?.primary.argsPatch.idempotencyKey).not.toBe('old-key');
    expect(card?.meta.supersedes).toBe(OPEN_ID);
  });

  it('refuses when the open preview belongs to a different tool (design D4)', async () => {
    const { tool } = buildRev({
      loaded: { approvalId: OPEN_ID, toolId: 'planner_mergeTasks', argsPatch: openArgsPatch },
    });
    const { out, suspend } = await runFirstPass(tool, {
      sourceTaskRef: TASK_A,
      targetTaskRef: TASK_B,
      kind: 'blocks',
      revisionOf: OPEN_ID,
    });
    expect(suspend).not.toHaveBeenCalled();
    expect(out.refusal).toMatch(/different kind of change/i);
  });

  it('refuses a card missing an endpoint rather than rebuilding from half of it', async () => {
    const { tool } = buildRev({
      loaded: {
        approvalId: OPEN_ID,
        toolId: 'planner_linkTasks',
        argsPatch: { action: 'link', sourceTaskId: TASK_A, kind: 'relates' },
      },
    });
    const { out, suspend } = await runFirstPass(tool, {
      sourceTaskRef: TASK_A,
      targetTaskRef: TASK_B,
      kind: 'blocks',
      revisionOf: OPEN_ID,
    });
    expect(suspend).not.toHaveBeenCalled();
    expect(out.refusal).toMatch(/incomplete/i);
  });

  it('refuses a NEW card when either endpoint already has a pending preview (AC1)', async () => {
    const { tool } = buildRev({ taken: [`task:${TASK_B}`], openPreview: null });
    const { out, suspend } = await runFirstPass(tool, {
      sourceTaskRef: TASK_A,
      targetTaskRef: TASK_B,
      kind: 'relates',
    });
    expect(suspend).not.toHaveBeenCalled();
    expect(out.refusal).toMatch(/already a proposal waiting/i);
  });
});
