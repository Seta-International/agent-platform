import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it, vi } from 'vitest';
import { makeCreateTaskTool } from '../../../../src/backend/orchestration/action/create-task.tool.ts';

function build(
  over: {
    resolvePlan?: () => Promise<unknown>;
    assertCanCreate?: () => Promise<void>;
    resolveDefaultBucket?: () => Promise<unknown>;
    search?: () => Promise<Array<{ taskId: string; title: string; score: number }>>;
  } = {},
) {
  const taskCreate = {
    resolvePlan: vi.fn(
      over.resolvePlan ?? (async () => ({ planId: 'p1', groupId: 'g1', planName: 'Sprint 32' })),
    ),
    assertCanCreate: vi.fn(over.assertCanCreate ?? (async () => {})),
    resolveDefaultBucket: vi.fn(
      over.resolveDefaultBucket ?? (async () => ({ bucketId: 'b1', bucketName: 'To do' })),
    ),
    create: vi.fn(async () => ({ taskId: 'new-task', replayed: false })),
  };
  const similarTasks = { search: vi.fn(over.search ?? (async () => [])) };
  const tool = makeCreateTaskTool({
    ports: { taskCreate, similarTasks } as never,
    ctx: { tenantId: 't1', actorUserId: 'a1' } as never,
  });
  return { tool, taskCreate, similarTasks };
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

const input = { planRef: 'Sprint 32', title: 'Deploy hiring screen' } as const;

describe('planner_createTask — first pass', () => {
  // THE ordering test for AC1: nothing is written, and the duplicate check
  // happens before the user is asked, not after the task exists.
  it('resolves, gates, searches, then suspends — and creates nothing', async () => {
    const order: string[] = [];
    const { tool, taskCreate, similarTasks } = build();
    taskCreate.resolvePlan.mockImplementation(async () => {
      order.push('resolve');
      return { planId: 'p1', groupId: 'g1', planName: 'Sprint 32' };
    });
    taskCreate.assertCanCreate.mockImplementation(async () => {
      order.push('gate');
    });
    taskCreate.resolveDefaultBucket.mockImplementation(async () => {
      order.push('bucket');
      return { bucketId: 'b1', bucketName: 'To do' };
    });
    similarTasks.search.mockImplementation(async () => {
      order.push('search');
      return [];
    });
    const suspend = vi.fn(async () => {
      order.push('suspend');
    });
    await tool.execute!(input as never, firstPassCtx(suspend));
    // The bucket lookup sits after the gate and before the search, for the same
    // reason the gate sits where it does: a request that cannot land should not
    // spend an embedding call.
    expect(order).toEqual(['resolve', 'gate', 'bucket', 'search', 'suspend']);
    expect(taskCreate.create).not.toHaveBeenCalled();
  });

  // Refusing beats creating an invisible task: with no column to render it in,
  // a "created" task the user cannot find is worse than a plain no.
  it('refuses when the plan has no bucket to put the task in', async () => {
    const { tool, taskCreate, similarTasks } = build({ resolveDefaultBucket: async () => null });
    const suspend = vi.fn(async () => {});
    const out = (await tool.execute!(input as never, firstPassCtx(suspend))) as {
      created: boolean;
      refusal?: string | null;
    };
    expect(out.created).toBe(false);
    expect(out.refusal).toMatch(/bucket/i);
    expect(out.refusal).toMatch(/Sprint 32/);
    expect(suspend).not.toHaveBeenCalled();
    expect(taskCreate.create).not.toHaveBeenCalled();
    expect(similarTasks.search).not.toHaveBeenCalled();
  });

  it('searches only within the resolved plan', async () => {
    const { tool, similarTasks } = build();
    await tool.execute!(input as never, firstPassCtx(vi.fn(async () => {})));
    expect(similarTasks.search).toHaveBeenCalledWith(
      expect.objectContaining({ planId: 'p1', tenantId: 't1' }),
    );
  });

  it('folds the thresholded matches onto the card as alternates', async () => {
    const { tool } = build({
      search: async () => [
        { taskId: 't-1', title: 'Deploy hiring screen v2', score: 0.9 },
        // distance 0.5 > maybeDup 0.45 → not similar enough to offer.
        { taskId: 't-2', title: 'Unrelated', score: 0.5 },
      ],
    });
    let suspended: { card?: { alternates: unknown[] } } | undefined;
    await tool.execute!(
      input as never,
      firstPassCtx(async (p) => {
        suspended = p as never;
      }),
    );
    expect(suspended?.card?.alternates).toHaveLength(1);
  });

  it('asks which plan when the name is ambiguous, and never suspends', async () => {
    const { tool, taskCreate } = build({
      resolvePlan: async () => ({
        ambiguous: [
          { planId: 'p1', planName: 'Sprint 32' },
          { planId: 'p2', planName: 'Sprint 32' },
        ],
      }),
    });
    const suspend = vi.fn(async () => {});
    const out = (await tool.execute!(input as never, firstPassCtx(suspend))) as {
      created: boolean;
      refusal?: string | null;
    };
    expect(out.created).toBe(false);
    expect(out.refusal).toMatch(/which/i);
    expect(suspend).not.toHaveBeenCalled();
    expect(taskCreate.assertCanCreate).not.toHaveBeenCalled();
  });

  it('refuses an unknown plan without a schema error', async () => {
    const { tool } = build({ resolvePlan: async () => null });
    const suspend = vi.fn(async () => {});
    const out = (await tool.execute!(input as never, firstPassCtx(suspend))) as {
      refusal?: string | null;
    };
    expect(out.refusal).toMatch(/Sprint 32/);
    expect(suspend).not.toHaveBeenCalled();
  });

  it('does not suspend for an actor without create permission', async () => {
    const { tool, similarTasks } = build({
      assertCanCreate: async () => {
        throw Object.assign(new Error('forbidden'), { code: 'FORBIDDEN' });
      },
    });
    const suspend = vi.fn(async () => {});
    await expect(tool.execute!(input as never, firstPassCtx(suspend))).rejects.toThrow();
    expect(suspend).not.toHaveBeenCalled();
    // The gate runs before the search, so a refused actor never spends an
    // embedding call either.
    expect(similarTasks.search).not.toHaveBeenCalled();
  });

  // A dead vector store must not stop a user creating a task.
  it('still previews when the similarity search fails', async () => {
    const { tool } = build({
      search: async () => {
        throw new Error('pgvector unavailable');
      },
    });
    let suspended: { card?: { alternates: unknown[] } } | undefined;
    await tool.execute!(
      input as never,
      firstPassCtx(async (p) => {
        suspended = p as never;
      }),
    );
    expect(suspended?.card?.alternates).toEqual([]);
  });
});

describe('planner_createTask — resume pass', () => {
  it('creates exactly the draft that was previewed', async () => {
    const { tool, taskCreate } = build();
    const draft = { title: 'Deploy hiring screen', priority: 'urgent' as const };
    const out = (await tool.execute!(
      input as never,
      resumeCtx({ action: 'create', planId: 'p1', bucketId: 'b1', draft, idempotencyKey: 'k1' }),
    )) as { created: boolean; taskId: string | null };
    expect(out).toMatchObject({ created: true, taskId: 'new-task' });
    expect(taskCreate.create).toHaveBeenCalledWith({
      tenantId: 't1',
      actorUserId: 'a1',
      planId: 'p1',
      // Read straight off the card, never re-resolved: the plan's first column
      // may have changed since the preview, and the user confirmed THIS one.
      bucketId: 'b1',
      draft,
      idempotencyKey: 'k1',
    });
  });

  it('refuses a create payload with no bucket rather than writing an invisible task', async () => {
    const { tool, taskCreate } = build();
    const out = (await tool.execute!(
      input as never,
      // A card minted before FUT-821 added the bucket, or a truncated payload.
      resumeCtx({ action: 'create', planId: 'p1', draft: { title: 'x' }, idempotencyKey: 'k1' }),
    )) as { created: boolean; refusal?: string | null };
    expect(out.created).toBe(false);
    expect(out.refusal).toMatch(/again/i);
    expect(taskCreate.create).not.toHaveBeenCalled();
  });

  // The branch that makes "on Cancel nothing is left over" true for the
  // duplicate case too: no write, no gateway call, no idempotency row.
  it('use_existing writes nothing and returns the existing task', async () => {
    const { tool, taskCreate } = build();
    const out = (await tool.execute!(
      input as never,
      resumeCtx({ action: 'use_existing', existingTaskId: 't-1', idempotencyKey: 'k1' }),
    )) as { created: boolean; taskId: string | null; usedExisting?: boolean };
    expect(out).toMatchObject({ created: false, taskId: 't-1', usedExisting: true });
    expect(taskCreate.create).not.toHaveBeenCalled();
  });

  it('decline writes nothing', async () => {
    const { tool, taskCreate } = build();
    const out = (await tool.execute!(
      input as never,
      resumeCtx({ action: 'decline', idempotencyKey: 'k1' }),
    )) as { created: boolean };
    expect(out.created).toBe(false);
    expect(taskCreate.create).not.toHaveBeenCalled();
  });

  it('never re-resolves the plan or re-searches on resume', async () => {
    const { tool, taskCreate, similarTasks } = build();
    await tool.execute!(
      input as never,
      resumeCtx({
        action: 'create',
        planId: 'p1',
        bucketId: 'b1',
        draft: { title: 'x' },
        idempotencyKey: 'k1',
      }),
    );
    expect(taskCreate.resolvePlan).not.toHaveBeenCalled();
    expect(taskCreate.resolveDefaultBucket).not.toHaveBeenCalled();
    expect(similarTasks.search).not.toHaveBeenCalled();
  });

  it('refuses a create payload with no draft', async () => {
    const { tool, taskCreate } = build();
    const out = (await tool.execute!(
      input as never,
      resumeCtx({ action: 'create', planId: 'p1', idempotencyKey: 'k1' }),
    )) as { created: boolean; refusal?: string | null };
    expect(out.created).toBe(false);
    expect(out.refusal).toMatch(/again/i);
    expect(taskCreate.create).not.toHaveBeenCalled();
  });
});
