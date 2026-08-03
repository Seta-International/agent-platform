import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it, vi } from 'vitest';
import type { ActionTaskSnapshot } from '../../../../src/backend/orchestration/action/schemas.ts';
import { makeUpdateTaskTool } from '../../../../src/backend/orchestration/action/update-task.tool.ts';

const TASK_ID = '66be2be2-394d-4184-b106-c412289fd1e1';
const GROUP_ID = 'aa11bb22-cc33-4d44-8e55-ff6677889900';

const snapshot: ActionTaskSnapshot = {
  taskId: TASK_ID,
  title: 'AWS migration',
  description: null,
  due_at: '2026-08-12T16:59:00.000Z',
  start_at: null,
  priority_number: 5,
  percent_complete: 0,
  version: 4,
  groupId: GROUP_ID,
};

function build(
  over: {
    assertCanUpdate?: () => Promise<void>;
    update?: () => Promise<never> | Promise<unknown>;
  } = {},
) {
  const taskRead = { read: vi.fn(async () => snapshot) };
  const taskUpdate = {
    assertCanUpdate: vi.fn(over.assertCanUpdate ?? (async () => {})),
    update: vi.fn(over.update ?? (async () => ({ taskId: TASK_ID, version: 5, replayed: false }))),
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

describe('planner_updateTask — first pass', () => {
  it('checks permission before it suspends, so a viewer never creates an approval row', async () => {
    const order: string[] = [];
    const { tool, taskUpdate } = build();
    taskUpdate.assertCanUpdate.mockImplementation(async () => {
      order.push('assert');
    });
    const suspend = vi.fn(async () => {
      order.push('suspend');
    });
    await tool.execute!(
      { taskId: TASK_ID, patch: { due_at: '2026-08-15' } } as never,
      firstPassCtx(suspend),
    );
    expect(order).toEqual(['assert', 'suspend']);
    expect(taskUpdate.assertCanUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: TASK_ID, groupId: GROUP_ID, actorUserId: 'a1' }),
    );
  });

  it('suspends with a card whose argsPatch carries the normalised patch, version and key', async () => {
    const { tool } = build();
    let suspended: { card?: unknown } | undefined;
    const suspend = vi.fn(async (p: unknown) => {
      suspended = p as { card?: unknown };
    });
    const out = await tool.execute!(
      { taskId: TASK_ID, patch: { due_at: '2026-08-15' } } as never,
      firstPassCtx(suspend),
    );
    expect(out).toEqual({ updated: false, taskId: TASK_ID });
    const card = suspended?.card as { primary: { argsPatch: Record<string, unknown> } };
    expect(card.primary.argsPatch).toEqual({
      action: 'update',
      taskId: TASK_ID,
      // date-only in, absolute 23:59 platform-local out
      patch: { due_at: '2026-08-15T16:59:00.000Z' },
      expectedVersion: 4,
      idempotencyKey: expect.any(String),
    });
  });

  it('refuses an empty patch instead of suspending — never invent a value', async () => {
    const { tool } = build();
    const suspend = vi.fn(async () => {});
    const out = (await tool.execute!(
      { taskId: TASK_ID, patch: {} } as never,
      firstPassCtx(suspend),
    )) as { updated: boolean; refusal?: string | null };
    expect(suspend).not.toHaveBeenCalled();
    expect(out.updated).toBe(false);
    expect(out.refusal).toMatch(/which value/i);
  });

  it('does not suspend for an actor without the permission', async () => {
    const { tool } = build({
      assertCanUpdate: async () => {
        throw Object.assign(new Error('forbidden'), { code: 'FORBIDDEN' });
      },
    });
    const suspend = vi.fn(async () => {});
    await expect(
      tool.execute!(
        { taskId: TASK_ID, patch: { due_at: '2026-08-15' } } as never,
        firstPassCtx(suspend),
      ),
      // wrapExecute maps a domain FORBIDDEN onto the PERMISSION_DENIED taxonomy
      // and replaces the message with a safe one — the internal detail is
      // deliberately not leaked to the model.
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(suspend).not.toHaveBeenCalled();
  });
});

function resumeCtx(resumeData: unknown) {
  const suspend = vi.fn(async () => {});
  return { ctx: { agent: { suspend, resumeData }, requestContext: rc() } as never, suspend };
}

describe('planner_updateTask — resume pass', () => {
  const goodResume = {
    action: 'update' as const,
    taskId: TASK_ID,
    patch: { due_at: '2026-08-15T16:59:00.000Z' },
    expectedVersion: 4,
    idempotencyKey: 'key-1',
  };

  it('performs the gated write with the version and key that came off the card', async () => {
    const { tool, taskUpdate } = build();
    const { ctx: c, suspend } = resumeCtx(goodResume);
    const out = (await tool.execute!({ taskId: TASK_ID, patch: {} } as never, c)) as {
      updated: boolean;
    };
    expect(out.updated).toBe(true);
    expect(suspend).not.toHaveBeenCalled();
    expect(taskUpdate.update).toHaveBeenCalledWith({
      tenantId: 't1',
      actorUserId: 'a1',
      taskId: TASK_ID,
      expectedVersion: 4,
      patch: { due_at: '2026-08-15T16:59:00.000Z' },
      idempotencyKey: 'key-1',
    });
  });

  it('never re-reads or re-previews on resume — the preview is already agreed', async () => {
    const { tool, taskRead } = build();
    const { ctx: c } = resumeCtx(goodResume);
    await tool.execute!({ taskId: TASK_ID, patch: {} } as never, c);
    expect(taskRead.read).not.toHaveBeenCalled();
  });

  it('decline: no gateway call at all, so no idempotency row is ever written', async () => {
    const { tool, taskUpdate } = build();
    const { ctx: c } = resumeCtx({ action: 'decline', taskId: TASK_ID });
    const out = (await tool.execute!({ taskId: TASK_ID, patch: {} } as never, c)) as {
      updated: boolean;
    };
    expect(out).toEqual({ updated: false, taskId: TASK_ID, refusal: null });
    expect(taskUpdate.update).not.toHaveBeenCalled();
  });

  it('surfaces a stale-version CONFLICT instead of writing', async () => {
    const { tool } = build({
      update: async () => {
        throw Object.assign(new Error('Version mismatch'), { code: 'CONFLICT' });
      },
    });
    const { ctx: c } = resumeCtx(goodResume);
    // Same taxonomy mapping as PERMISSION_DENIED above: the domain detail is
    // replaced by a safe message, the code is what callers branch on.
    await expect(tool.execute!({ taskId: TASK_ID, patch: {} } as never, c)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('refuses a card that predates expectedVersion rather than writing unguarded', async () => {
    const { tool, taskUpdate } = build();
    const { ctx: c } = resumeCtx({
      action: 'update',
      taskId: TASK_ID,
      patch: { due_at: '2026-08-15T16:59:00.000Z' },
    });
    const out = (await tool.execute!({ taskId: TASK_ID, patch: {} } as never, c)) as {
      updated: boolean;
      refusal?: string | null;
    };
    expect(out.updated).toBe(false);
    expect(out.refusal).toMatch(/incomplete/i);
    expect(taskUpdate.update).not.toHaveBeenCalled();
  });
});
