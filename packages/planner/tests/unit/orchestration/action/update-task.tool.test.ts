import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it, vi } from 'vitest';
import type { ActionTaskSnapshot } from '../../../../src/backend/orchestration/action/schemas.ts';
import { makeUpdateTaskTool } from '../../../../src/backend/orchestration/action/update-task.tool.ts';

const TASK_ID = '66be2be2-394d-4184-b106-c412289fd1e1';
const TASK_ID_2 = '9f1d3a10-2b44-4c55-8d66-ee7788990011';
const TASK_ID_3 = '11112222-3333-4444-8555-666677778888';
const GROUP_ID = 'aa11bb22-cc33-4d44-8e55-ff6677889900';
const GROUP_ID_2 = 'bb22cc33-dd44-4e55-9f66-001122334455';

/** 21 distinct, syntactically valid UUIDs, so the cap — not the resolver —
 *  is what refuses them. */
function manyUuids(n: number): string[] {
  return Array.from(
    { length: n },
    (_, i) => `${TASK_ID.slice(0, -2)}${String(i).padStart(2, '0')}`,
  );
}

function snap(over: Partial<ActionTaskSnapshot> = {}): ActionTaskSnapshot {
  return {
    taskId: TASK_ID,
    title: 'AWS migration',
    description: null,
    due_at: '2026-08-12T16:59:00.000Z',
    start_at: null,
    priority_number: 5,
    percent_complete: 0,
    version: 4,
    groupId: GROUP_ID,
    ...over,
  };
}

function build(
  over: {
    snapshots?: ActionTaskSnapshot[];
    assertCanUpdateMany?: () => Promise<void>;
    updateMany?: () => Promise<never> | Promise<unknown>;
  } = {},
) {
  const snapshots = over.snapshots ?? [snap()];
  const taskRead = {
    readMany: vi.fn(async ({ taskIds }: { taskIds: string[] }) =>
      taskIds.map((id) => snapshots.find((s) => s.taskId === id) ?? snap({ taskId: id })),
    ),
  };
  // The parameters are declared even where the body ignores them: without them
  // `mock.calls[0][0]` is a zero-length tuple and the assertions below stop
  // typechecking.
  const taskUpdate = {
    assertCanUpdateMany: vi.fn(
      over.assertCanUpdateMany ?? (async (_args: { groupIds: string[] }) => {}),
    ),
    updateMany: vi.fn(
      over.updateMany ??
        (async (_args: { targets: unknown[] }) => ({
          taskIds: snapshots.map((s) => s.taskId),
          replayed: false,
        })),
    ),
  };
  const tool = makeUpdateTaskTool({
    ports: { taskRead, taskUpdate } as never,
    ctx: { tenantId: 't1', actorUserId: 'a1' } as never,
  });
  return { tool, taskRead, taskUpdate };
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

describe('planner_updateTask — first pass, one target', () => {
  it('checks permission before it suspends, so a viewer never creates an approval row', async () => {
    const order: string[] = [];
    const { tool, taskUpdate } = build();
    taskUpdate.assertCanUpdateMany.mockImplementation(async () => {
      order.push('assert');
    });
    const suspend = vi.fn(async () => {
      order.push('suspend');
    });
    await tool.execute!(
      { taskRefs: [TASK_ID], patch: { dueAt: '2026-08-15' } } as never,
      firstPassCtx(suspend),
    );
    expect(order).toEqual(['assert', 'suspend']);
    expect(taskUpdate.assertCanUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ groupIds: [GROUP_ID], actorUserId: 'a1' }),
    );
  });

  it('suspends with a card whose argsPatch carries targets, the normalised patch and a key', async () => {
    const { tool } = build();
    let suspended: { card?: unknown } | undefined;
    const suspend = vi.fn(async (p: unknown) => {
      suspended = p as { card?: unknown };
    });
    const out = await tool.execute!(
      { taskRefs: [TASK_ID], patch: { dueAt: '2026-08-15' } } as never,
      firstPassCtx(suspend),
    );
    expect(out).toEqual({ updated: false, taskIds: [TASK_ID] });
    const card = suspended?.card as { primary: { argsPatch: Record<string, unknown> } };
    expect(card.primary.argsPatch).toEqual({
      action: 'update',
      targets: [{ taskId: TASK_ID, expectedVersion: 4 }],
      // date-only in, absolute 23:59 platform-local out
      patch: { due_at: '2026-08-15T16:59:00.000Z' },
      idempotencyKey: expect.any(String),
    });
  });

  it('speaks the same vocabulary planner_queryTasks returns — words, not numbers', async () => {
    const { tool } = build();
    let suspended: { card?: unknown } | undefined;
    const suspend = vi.fn(async (p: unknown) => {
      suspended = p as { card?: unknown };
    });
    await tool.execute!(
      { taskRefs: [TASK_ID], patch: { priority: 'urgent', status: 'in_progress' } } as never,
      firstPassCtx(suspend),
    );
    const card = suspended?.card as { primary: { argsPatch: { patch: Record<string, unknown> } } };
    expect(card.primary.argsPatch.patch).toEqual({ priority_number: 1, percent_complete: 50 });
  });

  it('rejects the raw numeric vocabulary the model must never see', async () => {
    const { tool } = build();
    const suspend = vi.fn(async () => {});
    const out = (await tool.execute!(
      { taskRefs: [TASK_ID], patch: { priority_number: 1, percent_complete: 50 } } as never,
      firstPassCtx(suspend),
    )) as { message?: string };
    expect(out.message).toMatch(/validation failed/i);
    expect(out.message).toMatch(/priority_number/);
    expect(suspend).not.toHaveBeenCalled();
  });

  it('refuses an empty patch instead of suspending — never invent a value', async () => {
    const { tool } = build();
    const suspend = vi.fn(async () => {});
    const out = (await tool.execute!(
      { taskRefs: [TASK_ID], patch: {} } as never,
      firstPassCtx(suspend),
    )) as { updated: boolean; refusal?: string | null };
    expect(suspend).not.toHaveBeenCalled();
    expect(out.updated).toBe(false);
    expect(out.refusal).toMatch(/which value/i);
  });

  it('does not suspend for an actor without the permission', async () => {
    const { tool } = build({
      assertCanUpdateMany: async () => {
        throw Object.assign(new Error('forbidden'), { code: 'FORBIDDEN' });
      },
    });
    const suspend = vi.fn(async () => {});
    // wrapExecute maps a domain FORBIDDEN onto the PERMISSION_DENIED taxonomy
    // and replaces the message with a safe one.
    await expect(
      tool.execute!(
        { taskRefs: [TASK_ID], patch: { dueAt: '2026-08-15' } } as never,
        firstPassCtx(suspend),
      ),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(suspend).not.toHaveBeenCalled();
  });
});

describe('planner_updateTask — first pass, a batch', () => {
  it('previews N tasks in one card and one suspend', async () => {
    const snapshots = [
      snap({ taskId: TASK_ID, title: 'Alpha', version: 4 }),
      snap({ taskId: TASK_ID_2, title: 'Beta', version: 9 }),
      snap({ taskId: TASK_ID_3, title: 'Gamma', version: 1 }),
    ];
    const { tool } = build({ snapshots });
    let suspended: { card?: unknown } | undefined;
    const suspend = vi.fn(async (p: unknown) => {
      suspended = p as { card?: unknown };
    });
    await tool.execute!(
      { taskRefs: [TASK_ID, TASK_ID_2, TASK_ID_3], patch: { status: 'completed' } } as never,
      firstPassCtx(suspend),
    );
    expect(suspend).toHaveBeenCalledTimes(1);
    const card = suspended?.card as {
      summary: string;
      details: Array<{ rows: Array<{ k: string; v: string }> }>;
      primary: { argsPatch: { targets: unknown[] } };
    };
    expect(card.summary).toBe('3 tasks will change.');
    expect(card.details[0]!.rows.map((r) => r.k)).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(card.primary.argsPatch.targets).toEqual([
      { taskId: TASK_ID, expectedVersion: 4 },
      { taskId: TASK_ID_2, expectedVersion: 9 },
      { taskId: TASK_ID_3, expectedVersion: 1 },
    ]);
  });

  // The test that pins the CAP CHECK'S POSITION: 21 refs must cost zero reads.
  it('refuses more than 20 refs before touching a single port', async () => {
    const { tool, taskRead, taskUpdate } = build();
    const suspend = vi.fn(async () => {});
    const out = (await tool.execute!(
      { taskRefs: manyUuids(21), patch: { status: 'completed' } } as never,
      firstPassCtx(suspend),
    )) as { updated: boolean; taskIds: string[]; refusal?: string | null };
    expect(out.updated).toBe(false);
    expect(out.taskIds).toEqual([]);
    expect(out.refusal).toMatch(/at most 20/i);
    // Nothing was read, nothing was gated, nothing was previewed.
    expect(taskRead.readMany).not.toHaveBeenCalled();
    expect(taskUpdate.assertCanUpdateMany).not.toHaveBeenCalled();
    expect(suspend).not.toHaveBeenCalled();
  });

  it('tells the model not to split an oversized request into batches', async () => {
    const { tool } = build();
    const out = (await tool.execute!(
      { taskRefs: manyUuids(25), patch: { status: 'completed' } } as never,
      firstPassCtx(vi.fn(async () => {})),
    )) as { refusal?: string | null };
    expect(out.refusal).toMatch(/do not split/i);
  });

  it('refuses the WHOLE batch when one ref is unresolvable, before any read', async () => {
    const { tool, taskRead } = build();
    const suspend = vi.fn(async () => {});
    // "not-a-task" is neither a UUID nor an ordinal, and no conversation memory
    // is wired in a unit test, so resolveTaskRef throws its own explanatory
    // AgentToolError, which wrapExecute re-throws verbatim (the FUT-859 property).
    await expect(
      tool.execute!(
        { taskRefs: [TASK_ID, 'not-a-task'], patch: { status: 'completed' } } as never,
        firstPassCtx(suspend),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(taskRead.readMany).not.toHaveBeenCalled();
    expect(suspend).not.toHaveBeenCalled();
  });

  it('refuses two refs that resolve to the same task', async () => {
    const { tool, taskRead } = build();
    const suspend = vi.fn(async () => {});
    const out = (await tool.execute!(
      { taskRefs: [TASK_ID, TASK_ID], patch: { status: 'completed' } } as never,
      firstPassCtx(suspend),
    )) as { updated: boolean; refusal?: string | null };
    expect(out.updated).toBe(false);
    expect(out.refusal).toMatch(/same task/i);
    expect(taskRead.readMany).not.toHaveBeenCalled();
    expect(suspend).not.toHaveBeenCalled();
  });

  it('hands every group to the gate in ONE call, so none is silently dropped', async () => {
    const snapshots = [
      snap({ taskId: TASK_ID, groupId: GROUP_ID }),
      snap({ taskId: TASK_ID_2, groupId: GROUP_ID }),
      snap({ taskId: TASK_ID_3, groupId: GROUP_ID_2 }),
    ];
    const { tool, taskUpdate } = build({ snapshots });
    await tool.execute!(
      { taskRefs: [TASK_ID, TASK_ID_2, TASK_ID_3], patch: { status: 'completed' } } as never,
      firstPassCtx(vi.fn(async () => {})),
    );
    expect(taskUpdate.assertCanUpdateMany).toHaveBeenCalledTimes(1);
    expect(taskUpdate.assertCanUpdateMany.mock.calls[0]![0]).toMatchObject({
      groupIds: [GROUP_ID, GROUP_ID, GROUP_ID_2],
    });
  });
});

function resumeCtx(resumeData: unknown) {
  const suspend = vi.fn(async () => {});
  return { ctx: { agent: { suspend, resumeData }, requestContext: rc() } as never, suspend };
}

describe('planner_updateTask — resume pass', () => {
  const goodResume = {
    action: 'update' as const,
    targets: [{ taskId: TASK_ID, expectedVersion: 4 }],
    patch: { due_at: '2026-08-15T16:59:00.000Z' },
    idempotencyKey: 'key-1',
  };

  it('performs the gated write with the targets and key that came off the card', async () => {
    const { tool, taskUpdate } = build();
    const { ctx: c, suspend } = resumeCtx(goodResume);
    const out = (await tool.execute!({ taskRefs: [TASK_ID], patch: {} } as never, c)) as {
      updated: boolean;
    };
    expect(out.updated).toBe(true);
    expect(suspend).not.toHaveBeenCalled();
    expect(taskUpdate.updateMany).toHaveBeenCalledWith({
      tenantId: 't1',
      actorUserId: 'a1',
      targets: [{ taskId: TASK_ID, expectedVersion: 4 }],
      patch: { due_at: '2026-08-15T16:59:00.000Z' },
      idempotencyKey: 'key-1',
    });
  });

  it('writes a whole batch through ONE gateway call', async () => {
    const { tool, taskUpdate } = build();
    const { ctx: c } = resumeCtx({
      action: 'update',
      targets: [
        { taskId: TASK_ID, expectedVersion: 4 },
        { taskId: TASK_ID_2, expectedVersion: 9 },
      ],
      patch: { percent_complete: 100 },
      idempotencyKey: 'key-batch',
    });
    await tool.execute!({ taskRefs: [TASK_ID], patch: {} } as never, c);
    expect(taskUpdate.updateMany).toHaveBeenCalledTimes(1);
    expect(taskUpdate.updateMany.mock.calls[0]![0]).toMatchObject({
      targets: [
        { taskId: TASK_ID, expectedVersion: 4 },
        { taskId: TASK_ID_2, expectedVersion: 9 },
      ],
    });
  });

  it('never re-reads or re-previews on resume — the preview is already agreed', async () => {
    const { tool, taskRead } = build();
    const { ctx: c } = resumeCtx(goodResume);
    await tool.execute!({ taskRefs: [TASK_ID], patch: {} } as never, c);
    expect(taskRead.readMany).not.toHaveBeenCalled();
  });

  it('decline: no gateway call at all, so no idempotency row is ever written', async () => {
    const { tool, taskUpdate } = build();
    const { ctx: c } = resumeCtx({
      action: 'decline',
      targets: [{ taskId: TASK_ID, expectedVersion: 4 }],
    });
    const out = (await tool.execute!({ taskRefs: [TASK_ID], patch: {} } as never, c)) as {
      updated: boolean;
    };
    expect(out).toEqual({ updated: false, taskIds: [TASK_ID], refusal: null });
    expect(taskUpdate.updateMany).not.toHaveBeenCalled();
  });

  it('surfaces a stale-version CONFLICT instead of writing', async () => {
    const { tool } = build({
      updateMany: async () => {
        throw Object.assign(new Error('Version mismatch'), { code: 'CONFLICT' });
      },
    });
    const { ctx: c } = resumeCtx(goodResume);
    await expect(
      tool.execute!({ taskRefs: [TASK_ID], patch: {} } as never, c),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('refuses a card missing its patch or key rather than writing unguarded', async () => {
    const { tool, taskUpdate } = build();
    const { ctx: c } = resumeCtx({
      action: 'update',
      targets: [{ taskId: TASK_ID, expectedVersion: 4 }],
    });
    const out = (await tool.execute!({ taskRefs: [TASK_ID], patch: {} } as never, c)) as {
      updated: boolean;
      refusal?: string | null;
    };
    expect(out.updated).toBe(false);
    expect(out.refusal).toMatch(/incomplete/i);
    expect(taskUpdate.updateMany).not.toHaveBeenCalled();
  });
});
