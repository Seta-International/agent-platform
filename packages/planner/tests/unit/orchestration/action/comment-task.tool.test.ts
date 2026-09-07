import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it, vi } from 'vitest';
import { makeCommentTaskTool } from '../../../../src/backend/orchestration/action/comment-task.tool.ts';
import {
  fakePreviewPort,
  firstPassCtx,
  injectedPreview,
  OPEN_APPROVAL_ID,
  runFirstPass,
} from './revision-test-kit.ts';

const TASK_A = '66be2be2-394d-4184-b106-c412289fd1e1';

function build(
  over: { readMany?: () => Promise<unknown>; assertCanComment?: () => Promise<void> } = {},
) {
  const comment = {
    assertCanComment: vi.fn(over.assertCanComment ?? (async () => {})),
    comment: vi.fn(async () => ({ commentId: 'c1', replayed: false })),
  };
  // Reuses the read port the update tool already depends on — a comment needs
  // the same two facts (title, group) and there is no reason for a second read.
  const taskRead = {
    readMany: vi.fn(
      over.readMany ??
        (async () => [{ taskId: TASK_A, title: 'Deploy hiring screen', groupId: 'g1' }]),
    ),
  };
  // Every first pass now consults the preview port on the NEW-card path
  // (FUT-840), so the default fake answers "nothing open, nothing taken".
  const preview = fakePreviewPort({ taken: [] });
  const tool = makeCommentTaskTool({
    ports: { comment, taskRead, preview } as never,
    ctx: { tenantId: 't1', actorUserId: 'a1' } as never,
  });
  return { tool, comment, taskRead, preview };
}

function rc() {
  const requestContext = new RequestContext();
  requestContext.set('tenant_id', 't1');
  requestContext.set('actor', { type: 'user', user_id: 'a1' });
  return requestContext;
}

const input = { taskRef: TASK_A, body: 'Blocked on the vendor key.' } as const;

describe('planner_commentTask', () => {
  it('gates before it suspends, and posts nothing on the first pass', async () => {
    const order: string[] = [];
    const { tool, comment } = build();
    comment.assertCanComment.mockImplementation(async () => {
      order.push('gate');
    });
    const suspend = vi.fn(async () => {
      order.push('suspend');
    });
    await tool.execute!(
      input as never,
      {
        agent: { suspend, resumeData: undefined },
        requestContext: rc(),
      } as never,
    );
    expect(order).toEqual(['gate', 'suspend']);
    expect(comment.comment).not.toHaveBeenCalled();
  });

  it('posts exactly the body that was previewed', async () => {
    const { tool, comment } = build();
    const out = (await tool.execute!(
      input as never,
      {
        agent: {
          suspend: vi.fn(async () => {}),
          resumeData: {
            action: 'comment',
            taskId: TASK_A,
            body: 'Blocked on the vendor key.',
            idempotencyKey: 'k1',
          },
        },
        requestContext: rc(),
      } as never,
    )) as { commented: boolean; commentId: string | null };
    expect(out).toMatchObject({ commented: true, commentId: 'c1' });
    expect(comment.comment).toHaveBeenCalledWith({
      tenantId: 't1',
      actorUserId: 'a1',
      taskId: TASK_A,
      body: 'Blocked on the vendor key.',
      idempotencyKey: 'k1',
    });
  });

  it('decline posts nothing', async () => {
    const { tool, comment } = build();
    const out = (await tool.execute!(
      input as never,
      {
        agent: {
          suspend: vi.fn(async () => {}),
          resumeData: { action: 'decline', taskId: TASK_A, idempotencyKey: 'k1' },
        },
        requestContext: rc(),
      } as never,
    )) as { commented: boolean };
    expect(out.commented).toBe(false);
    expect(comment.comment).not.toHaveBeenCalled();
  });

  it('refuses a payload with no body rather than posting an empty comment', async () => {
    const { tool, comment } = build();
    const out = (await tool.execute!(
      input as never,
      {
        agent: {
          suspend: vi.fn(async () => {}),
          resumeData: { action: 'comment', taskId: TASK_A, idempotencyKey: 'k1' },
        },
        requestContext: rc(),
      } as never,
    )) as { commented: boolean; refusal?: string | null };
    expect(out.commented).toBe(false);
    expect(out.refusal).toMatch(/again/i);
    expect(comment.comment).not.toHaveBeenCalled();
  });

  // The update tool's error model, not the link tool's: readMany raises the
  // planner's own NOT_FOUND / FORBIDDEN, and that error IS the refusal. What
  // matters is that it happens before the gate and before any card exists.
  it('refuses an unreadable task without suspending', async () => {
    const { tool, comment } = build({
      readMany: async () => {
        throw new Error('NOT_FOUND');
      },
    });
    const suspend = vi.fn(async () => {});
    await expect(
      tool.execute!(
        input as never,
        {
          agent: { suspend, resumeData: undefined },
          requestContext: rc(),
        } as never,
      ),
    ).rejects.toThrow();
    expect(suspend).not.toHaveBeenCalled();
    expect(comment.assertCanComment).not.toHaveBeenCalled();
  });
});

describe('planner_commentTask — the revision branch (FUT-840)', () => {
  const OPEN_ID = OPEN_APPROVAL_ID;
  const OTHER_TASK = '9f1d3a10-2b44-4c55-8d66-ee7788990011';
  const openArgsPatch = {
    action: 'comment',
    taskId: TASK_A,
    body: 'waiting on the vendor',
    idempotencyKey: 'old-key',
  };

  function buildRev(
    over: {
      loaded?: { approvalId: string; toolId: string; argsPatch: Record<string, unknown> } | null;
      taken?: string[];
      openPreview?: ReturnType<typeof injectedPreview> | null;
      assertCanComment?: () => Promise<void>;
    } = {},
  ) {
    const comment = {
      assertCanComment: vi.fn(over.assertCanComment ?? (async () => {})),
      comment: vi.fn(async () => ({ commentId: 'c1', replayed: false })),
    };
    const taskRead = {
      readMany: vi.fn(async ({ taskIds }: { taskIds: string[] }) =>
        taskIds.map((id) => ({ taskId: id, title: 'Deploy hiring screen', groupId: 'g1' })),
      ),
    };
    const preview = fakePreviewPort({
      loaded:
        over.loaded === undefined
          ? { approvalId: OPEN_ID, toolId: 'planner_commentTask', argsPatch: openArgsPatch }
          : over.loaded,
      ...(over.taken ? { taken: over.taken } : {}),
    });
    const tool = makeCommentTaskTool({
      ports: { comment, taskRead, preview } as never,
      ctx: { tenantId: 't1', actorUserId: 'a1' } as never,
      openPreview: over.openPreview === undefined ? injectedPreview() : over.openPreview,
    });
    return { tool, comment, taskRead, preview };
  }

  it('takes the task FROM THE CARD and ignores the model taskRef (AC5.1)', async () => {
    const { tool } = buildRev();
    const { card } = await runFirstPass(tool, {
      taskRef: OTHER_TASK,
      body: 'vendor replied',
      revisionOf: OPEN_ID,
    });
    expect(card?.primary.argsPatch.taskId).toBe(TASK_A);
  });

  it('REPLACES the body — the user is confirming text, not accumulating it', async () => {
    // A comment has one field, so there is nothing to merge onto: "no, say it
    // like this instead" means the new words, not the old ones plus the new.
    const { tool } = buildRev();
    const { card } = await runFirstPass(tool, {
      taskRef: TASK_A,
      body: 'vendor replied',
      revisionOf: OPEN_ID,
    });
    expect(card?.primary.argsPatch.body).toBe('vendor replied');
  });

  it('shows the new body VERBATIM and unclipped on the rebuilt card', async () => {
    // A truncated preview would mean confirming words the user has not read.
    const long = 'x'.repeat(500);
    const { tool } = buildRev();
    const { card } = await runFirstPass(tool, {
      taskRef: TASK_A,
      body: long,
      revisionOf: OPEN_ID,
    });
    const text = card?.details.find((d) => d.kind === 'text');
    expect(text?.body).toBe(long);
  });

  it('re-gates assertCanComment before suspending (AC5.2)', async () => {
    const { tool } = buildRev({
      assertCanComment: async () => {
        throw Object.assign(new Error('forbidden'), { code: 'FORBIDDEN' });
      },
    });
    const suspend = vi.fn(async () => {});
    await expect(
      tool.execute!(
        { taskRef: TASK_A, body: 'vendor replied', revisionOf: OPEN_ID } as never,
        firstPassCtx(suspend),
      ),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(suspend).not.toHaveBeenCalled();
  });

  it('mints a fresh idempotency key and stamps meta.supersedes', async () => {
    const { tool } = buildRev();
    const { card } = await runFirstPass(tool, {
      taskRef: TASK_A,
      body: 'vendor replied',
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
      body: 'vendor replied',
      revisionOf: OPEN_ID,
    });
    expect(suspend).not.toHaveBeenCalled();
    expect(out.refusal).toMatch(/different kind of change/i);
  });

  it('refuses a card with no taskId rather than rebuilding from half of it', async () => {
    const { tool } = buildRev({
      loaded: {
        approvalId: OPEN_ID,
        toolId: 'planner_commentTask',
        argsPatch: { action: 'comment', body: 'x' },
      },
    });
    const { out, suspend } = await runFirstPass(tool, {
      taskRef: TASK_A,
      body: 'vendor replied',
      revisionOf: OPEN_ID,
    });
    expect(suspend).not.toHaveBeenCalled();
    expect(out.refusal).toMatch(/incomplete/i);
  });

  it('refuses a NEW card when the task already has a pending preview (AC1)', async () => {
    const { tool } = buildRev({ taken: [`task:${TASK_A}`], openPreview: null });
    const { out, suspend } = await runFirstPass(tool, {
      taskRef: TASK_A,
      body: 'vendor replied',
    });
    expect(suspend).not.toHaveBeenCalled();
    expect(out.refusal).toMatch(/already a proposal waiting/i);
  });

  it('skips the mutex pre-check on a revision', async () => {
    const { tool, preview } = buildRev({ taken: [`task:${TASK_A}`] });
    const { suspend } = await runFirstPass(tool, {
      taskRef: TASK_A,
      body: 'vendor replied',
      revisionOf: OPEN_ID,
    });
    expect(preview.takenDedupKeys).not.toHaveBeenCalled();
    expect(suspend).toHaveBeenCalledTimes(1);
  });
});
