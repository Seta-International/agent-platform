import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it, vi } from 'vitest';
import { makeCommentTaskTool } from '../../../../src/backend/orchestration/action/comment-task.tool.ts';

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
  const tool = makeCommentTaskTool({
    ports: { comment, taskRead } as never,
    ctx: { tenantId: 't1', actorUserId: 'a1' } as never,
  });
  return { tool, comment, taskRead };
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
