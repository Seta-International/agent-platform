import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it, vi } from 'vitest';
import { makeMergeTasksTool } from '../../../../src/backend/orchestration/action/merge-tasks.tool.ts';
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
  // Every first pass now consults the preview port on the NEW-card path
  // (FUT-840), so the default fake answers "nothing open, nothing taken".
  const preview = fakePreviewPort({ taken: [] });
  const tool = makeMergeTasksTool({
    ports: { taskLink, taskMerge, preview } as never,
    ctx: { tenantId: 't1', actorUserId: 'a1' } as never,
  });
  return { tool, taskLink, taskMerge, preview };
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

describe('planner_mergeTasks — the revision branch (FUT-840)', () => {
  const OPEN_ID = OPEN_APPROVAL_ID;
  const THIRD_TASK = '11112222-3333-4444-8555-666677778888';
  const DUP_ID = TASK_A;
  const KEEP_ID = TASK_B;
  const openArgsPatch = {
    action: 'merge',
    duplicateTaskId: DUP_ID,
    duplicateExpectedVersion: 3,
    keepTaskId: KEEP_ID,
    idempotencyKey: 'old-key',
  };

  function buildRev(
    over: {
      loaded?: { approvalId: string; toolId: string; argsPatch: Record<string, unknown> } | null;
      taken?: string[];
      openPreview?: ReturnType<typeof injectedPreview> | null;
      assertCanMerge?: () => Promise<void>;
      readEndpoint?: (a: { taskId: string }) => Promise<unknown>;
    } = {},
  ) {
    const taskLink = {
      readEndpoint: vi.fn(
        over.readEndpoint ??
          (async ({ taskId }: { taskId: string }) =>
            snap(
              taskId,
              taskId === DUP_ID ? 'Draft doc' : 'Doc',
              taskId === DUP_ID ? 'g-dup' : 'g-keep',
            )),
      ),
      assertCanLink: vi.fn(async () => {}),
      readPairLink: vi.fn(async () => null),
      link: vi.fn(async () => ({ linkId: 'l1', replayed: false })),
    };
    const taskMerge = {
      assertCanMerge: vi.fn(
        over.assertCanMerge ??
          (async (_a: { duplicateGroupId: string; keepGroupId: string }) => {}),
      ),
      merge: vi.fn(async () => ({ replayed: false })),
    };
    const preview = fakePreviewPort({
      loaded:
        over.loaded === undefined
          ? { approvalId: OPEN_ID, toolId: 'planner_mergeTasks', argsPatch: openArgsPatch }
          : over.loaded,
      ...(over.taken ? { taken: over.taken } : {}),
    });
    const tool = makeMergeTasksTool({
      ports: { taskLink, taskMerge, preview } as never,
      ctx: { tenantId: 't1', actorUserId: 'a1' } as never,
      openPreview:
        over.openPreview === undefined
          ? injectedPreview({ toolId: 'planner_mergeTasks', taskIds: [TASK_A, TASK_B] })
          : over.openPreview,
    });
    return { tool, taskLink, taskMerge, preview };
  }

  it('swaps which side survives when the refs are the same pair reversed ("à ngược lại")', async () => {
    // Swapping does not change the SET of tasks — both were already inside the
    // gated pair — but it does redirect which task goes to the trash, which is
    // why the re-gate below is load-bearing rather than ceremonial.
    const { tool } = buildRev();
    const { card } = await runFirstPass(tool, {
      duplicateTaskRef: KEEP_ID,
      keepTaskRef: DUP_ID,
    });
    expect(card?.primary.argsPatch.duplicateTaskId).toBe(KEEP_ID);
    expect(card?.primary.argsPatch.keepTaskId).toBe(DUP_ID);
  });

  it('refs naming a task outside the card pair are a NEW request (design D5, AC5)', async () => {
    // Design D20 decides this before merge's own permutation rule is reached: the
    // resolved pair does not match the card's, so this never enters the revision
    // branch. The open card stays pending and a separate merge is proposed.
    const { tool } = buildRev();
    const { card } = await runFirstPass(tool, {
      duplicateTaskRef: DUP_ID,
      keepTaskRef: THIRD_TASK,
    });
    expect(card?.primary.argsPatch).toMatchObject({
      duplicateTaskId: DUP_ID,
      keepTaskId: THIRD_TASK,
    });
    expect(card?.meta.supersedes).toBeUndefined();
  });

  it('refuses when both refs resolve to the SAME task', async () => {
    const { tool } = buildRev();
    const { out, suspend } = await runFirstPass(tool, {
      duplicateTaskRef: DUP_ID,
      keepTaskRef: DUP_ID,
    });
    expect(suspend).not.toHaveBeenCalled();
    expect(out.refusal).toBeTruthy();
  });

  it('re-gates assertCanMerge on the SWAPPED roles (AC5.2)', async () => {
    // assertCanMerge is asymmetric: it needs planner.task.delete on the
    // DUPLICATE's group. A swap therefore genuinely needs a fresh gate.
    const { tool, taskMerge } = buildRev();
    await runFirstPass(tool, {
      duplicateTaskRef: KEEP_ID,
      keepTaskRef: DUP_ID,
    });
    expect(taskMerge.assertCanMerge.mock.calls[0]![0]).toMatchObject({
      duplicateGroupId: 'g-keep',
      keepGroupId: 'g-dup',
    });
  });

  it('refuses a swap the actor may not delete, leaving the old card pending', async () => {
    const { tool } = buildRev({
      assertCanMerge: async () => {
        throw Object.assign(new Error('forbidden'), { code: 'FORBIDDEN' });
      },
    });
    const suspend = vi.fn(async () => {});
    await expect(
      tool.execute!(
        { duplicateTaskRef: KEEP_ID, keepTaskRef: DUP_ID } as never,
        firstPassCtx(suspend),
      ),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(suspend).not.toHaveBeenCalled();
  });

  it('carries the CURRENT duplicate version, re-read after the swap', async () => {
    const { tool } = buildRev({
      readEndpoint: async ({ taskId }: { taskId: string }) => ({
        ...snap(taskId, taskId === DUP_ID ? 'Draft doc' : 'Doc'),
        version: taskId === KEEP_ID ? 7 : 3,
      }),
    });
    const { card } = await runFirstPass(tool, {
      duplicateTaskRef: KEEP_ID,
      keepTaskRef: DUP_ID,
    });
    expect(card?.primary.argsPatch.duplicateExpectedVersion).toBe(7);
  });

  it('mints a fresh idempotency key and stamps meta.supersedes', async () => {
    const { tool } = buildRev();
    const { card } = await runFirstPass(tool, {
      duplicateTaskRef: DUP_ID,
      keepTaskRef: KEEP_ID,
    });
    expect(card?.primary.argsPatch.idempotencyKey).not.toBe('old-key');
    expect(card?.meta.supersedes).toBe(OPEN_ID);
  });

  it('refuses via the mutex when the open preview belongs to a different tool (design D4)', async () => {
    // D20 reaches D4's outcome through ONE mechanism: a link card is not adjustable
    // by the merge tool, so this falls through to the new-card path, where the
    // `task:` key that link card holds refuses it in a sentence.
    const { tool } = buildRev({
      openPreview: injectedPreview({ toolId: 'planner_linkTasks', taskIds: [TASK_A, TASK_B] }),
      taken: [`task:${DUP_ID}`],
    });
    const { out, suspend } = await runFirstPass(tool, {
      duplicateTaskRef: DUP_ID,
      keepTaskRef: KEEP_ID,
    });
    expect(suspend).not.toHaveBeenCalled();
    expect(out.refusal).toMatch(/already a proposal waiting/i);
  });

  it('refuses a card missing a side rather than rebuilding from half of it', async () => {
    const { tool } = buildRev({
      loaded: {
        approvalId: OPEN_ID,
        toolId: 'planner_mergeTasks',
        argsPatch: { action: 'merge', duplicateTaskId: DUP_ID },
      },
    });
    const { out, suspend } = await runFirstPass(tool, {
      duplicateTaskRef: DUP_ID,
      keepTaskRef: KEEP_ID,
    });
    expect(suspend).not.toHaveBeenCalled();
    expect(out.refusal).toMatch(/incomplete/i);
  });

  it('refuses a NEW card when either task already has a pending preview (AC1)', async () => {
    const { tool } = buildRev({ taken: [`task:${KEEP_ID}`], openPreview: null });
    const { out, suspend } = await runFirstPass(tool, {
      duplicateTaskRef: DUP_ID,
      keepTaskRef: KEEP_ID,
    });
    expect(suspend).not.toHaveBeenCalled();
    expect(out.refusal).toMatch(/already a proposal waiting/i);
  });
});
