import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it, vi } from 'vitest';
import { makeAssignTaskTool } from '../../../../src/backend/orchestration/action/assign-task.tool.ts';
import {
  fakePreviewPort,
  injectedPreview,
  OPEN_APPROVAL_ID,
  runFirstPass,
} from './revision-test-kit.ts';

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
  // Every first pass now consults the preview port on the NEW-card path
  // (FUT-840), so the default fake answers "nothing open, nothing taken".
  const preview = fakePreviewPort({ taken: [] });
  const tool = makeAssignTaskTool({
    ports: { taskAssign, preview } as never,
    ctx: { tenantId: 't1', actorUserId: 'a1' } as never,
  });
  return { tool, taskAssign, preview };
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

describe('planner_assignTask — the revision branch (FUT-840)', () => {
  const OPEN_ID = OPEN_APPROVAL_ID;
  const OTHER_TASK = '9f1d3a10-2b44-4c55-8d66-ee7788990011';
  const openArgsPatch = {
    action: 'assign',
    taskId: TASK_A,
    assigneeUserIds: ['u-binh'],
    idempotencyKey: 'old-key',
  };

  function buildRev(
    over: {
      loaded?: { approvalId: string; toolId: string; argsPatch: Record<string, unknown> } | null;
      taken?: string[];
      openPreview?: ReturnType<typeof injectedPreview> | null;
      assertCanAssign?: () => Promise<void>;
      resolveMembers?: (a: { query: string }) => Promise<unknown[]>;
    } = {},
  ) {
    const taskAssign = {
      readForAssign: vi.fn(async () => ({
        title: 'Deploy hiring screen',
        groupId: 'g1',
        assignees: [{ userId: 'u-binh', name: 'Bình' }],
      })),
      assertCanAssign: vi.fn(over.assertCanAssign ?? (async () => {})),
      resolveMembers: vi.fn(
        over.resolveMembers ??
          (async ({ query }: { query: string }) =>
            query.toLowerCase().includes('tu')
              ? [{ userId: 'u-tuan', name: 'Tuấn', inGroup: true }]
              : []),
      ),
      assign: vi.fn(async () => ({ replayed: false })),
    };
    const preview = fakePreviewPort({
      loaded:
        over.loaded === undefined
          ? { approvalId: OPEN_ID, toolId: 'planner_assignTask', argsPatch: openArgsPatch }
          : over.loaded,
      ...(over.taken ? { taken: over.taken } : {}),
    });
    const tool = makeAssignTaskTool({
      ports: { taskAssign, preview } as never,
      ctx: { tenantId: 't1', actorUserId: 'a1' } as never,
      openPreview: over.openPreview === undefined ? injectedPreview() : over.openPreview,
    });
    return { tool, taskAssign, preview };
  }

  it('takes the task FROM THE CARD and ignores the model taskRef (AC5.1)', async () => {
    const { tool } = buildRev();
    const { card } = await runFirstPass(tool, {
      taskRef: OTHER_TASK,
      assigneeRefs: ['Tuấn'],
      revisionOf: OPEN_ID,
    });
    expect(card?.primary.argsPatch.taskId).toBe(TASK_A);
  });

  it('REPLACES the assignee set — the tool has replace semantics (FUT-806 design D5)', async () => {
    // Unioning is the MODEL's job when the user says "thêm Tuấn nữa": the OPEN
    // PREVIEW block renders the proposed set with names, so it can compute the
    // union against the PROPOSED set rather than the task's stored one.
    const { tool } = buildRev();
    const { card } = await runFirstPass(tool, {
      taskRef: TASK_A,
      assigneeRefs: ['Tuấn'],
      revisionOf: OPEN_ID,
    });
    expect(card?.primary.argsPatch.assigneeUserIds).toEqual(['u-tuan']);
  });

  it('re-gates assertCanAssign on the card task before suspending (AC5.2)', async () => {
    const { tool } = buildRev({
      assertCanAssign: async () => {
        throw Object.assign(new Error('forbidden'), { code: 'FORBIDDEN' });
      },
    });
    const suspend = vi.fn(async () => {});
    await expect(
      tool.execute!(
        { taskRef: TASK_A, assigneeRefs: ['Tuấn'], revisionOf: OPEN_ID } as never,
        firstPassCtx(suspend),
      ),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(suspend).not.toHaveBeenCalled();
  });

  it('refuses an out-of-group assignee, leaving the old card pending', async () => {
    const { tool } = buildRev({ resolveMembers: async () => [] });
    const { out, suspend } = await runFirstPass(tool, {
      taskRef: TASK_A,
      assigneeRefs: ['Nobody'],
      revisionOf: OPEN_ID,
    });
    expect(suspend).not.toHaveBeenCalled();
    expect(out.refusal).toMatch(/Nobody/);
  });

  it('mints a fresh idempotency key and stamps meta.supersedes', async () => {
    const { tool } = buildRev();
    const { card } = await runFirstPass(tool, {
      taskRef: TASK_A,
      assigneeRefs: ['Tuấn'],
      revisionOf: OPEN_ID,
    });
    expect(card?.primary.argsPatch.idempotencyKey).not.toBe('old-key');
    expect(card?.meta.supersedes).toBe(OPEN_ID);
  });

  it('refuses when the open preview belongs to a different tool (design D4)', async () => {
    const { tool } = buildRev({
      loaded: { approvalId: OPEN_ID, toolId: 'planner_updateTask', argsPatch: openArgsPatch },
    });
    const { out, suspend } = await runFirstPass(tool, {
      taskRef: TASK_A,
      assigneeRefs: ['Tuấn'],
      revisionOf: OPEN_ID,
    });
    expect(suspend).not.toHaveBeenCalled();
    expect(out.refusal).toMatch(/different kind of change/i);
  });

  it('refuses a NEW card when the task already has a pending preview (AC1)', async () => {
    const { tool } = buildRev({ taken: [`task:${TASK_A}`], openPreview: null });
    const { out, suspend } = await runFirstPass(tool, {
      taskRef: TASK_A,
      assigneeRefs: ['Tuấn'],
    });
    expect(suspend).not.toHaveBeenCalled();
    expect(out.refusal).toMatch(/already a proposal waiting/i);
  });

  it('skips the mutex pre-check on a revision', async () => {
    const { tool, preview } = buildRev({ taken: [`task:${TASK_A}`] });
    const { suspend } = await runFirstPass(tool, {
      taskRef: TASK_A,
      assigneeRefs: ['Tuấn'],
      revisionOf: OPEN_ID,
    });
    expect(preview.takenDedupKeys).not.toHaveBeenCalled();
    expect(suspend).toHaveBeenCalledTimes(1);
  });

  it('refuses a card with no taskId rather than rebuilding from half of it', async () => {
    const { tool } = buildRev({
      loaded: {
        approvalId: OPEN_ID,
        toolId: 'planner_assignTask',
        argsPatch: { action: 'assign', assigneeUserIds: ['u-binh'] },
      },
    });
    const { out, suspend } = await runFirstPass(tool, {
      taskRef: TASK_A,
      assigneeRefs: ['Tuấn'],
      revisionOf: OPEN_ID,
    });
    expect(suspend).not.toHaveBeenCalled();
    expect(out.refusal).toMatch(/incomplete/i);
  });
});
