import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it, vi } from 'vitest';
import { makeCreateTaskTool } from '../../../../src/backend/orchestration/action/create-task.tool.ts';
import {
  fakePreviewPort,
  injectedPreview,
  OPEN_APPROVAL_ID,
  runFirstPass,
} from './revision-test-kit.ts';

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
  // A create card declares no dedupKeys, so this port should stay untouched on
  // the ordinary path (FUT-840) — the fake exists to prove that, not to answer.
  const preview = fakePreviewPort({ taken: [] });
  const tool = makeCreateTaskTool({
    ports: { taskCreate, similarTasks, preview } as never,
    ctx: { tenantId: 't1', actorUserId: 'a1' } as never,
  });
  return { tool, taskCreate, similarTasks, preview };
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

describe('planner_createTask — the revision branch (FUT-840)', () => {
  const OPEN_ID = OPEN_APPROVAL_ID;
  const openArgsPatch = {
    action: 'create',
    planId: 'p1',
    bucketId: 'b1',
    draft: { title: 'Write the release notes', priority: 'medium' },
    idempotencyKey: 'old-key',
  };

  function buildRev(
    over: {
      loaded?: { approvalId: string; toolId: string; argsPatch: Record<string, unknown> } | null;
      openPreview?: ReturnType<typeof injectedPreview> | null;
      assertCanCreate?: () => Promise<void>;
    } = {},
  ) {
    const taskCreate = {
      resolvePlan: vi.fn(async () => ({ planId: 'p1', groupId: 'g1', planName: 'Sprint 32' })),
      assertCanCreate: vi.fn(over.assertCanCreate ?? (async () => {})),
      resolveDefaultBucket: vi.fn(async () => ({ bucketId: 'b1', bucketName: 'To do' })),
      create: vi.fn(async () => ({ taskId: 'new-task', replayed: false })),
    };
    // The parameter is declared even though the body ignores it: without it
    // `mock.calls[0][0]` is a zero-length tuple and the assertion below stops
    // typechecking — the same convention build() uses above.
    const similarTasks = {
      search: vi.fn(async (_args: { queryText: string }) => []),
    };
    const preview = fakePreviewPort({
      loaded:
        over.loaded === undefined
          ? { approvalId: OPEN_ID, toolId: 'planner_createTask', argsPatch: openArgsPatch }
          : over.loaded,
      taken: [],
    });
    const tool = makeCreateTaskTool({
      ports: { taskCreate, similarTasks, preview } as never,
      ctx: { tenantId: 't1', actorUserId: 'a1' } as never,
      openPreview:
        over.openPreview === undefined
          ? injectedPreview({ toolId: 'planner_createTask' })
          : over.openPreview,
    });
    return { tool, taskCreate, similarTasks, preview };
  }

  it('takes the plan FROM THE CARD and ignores the model planRef', async () => {
    // planId is FIXED: the card pins planId AND bucketId, and moving the plan
    // moves the bucket and the board the task lands on. That is a different
    // request, not an adjustment.
    const { tool, taskCreate } = buildRev();
    const { card } = await runFirstPass(tool, {
      planRef: 'Some Other Plan',
      title: 'Write the release notes',
    });
    expect(taskCreate.resolvePlan).toHaveBeenCalledWith(expect.objectContaining({ planRef: 'p1' }));
    expect(card?.primary.argsPatch.planId).toBe('p1');
  });

  it('MERGES the draft field-wise — an unnamed field survives (design D3)', async () => {
    const { tool } = buildRev();
    const { card } = await runFirstPass(tool, {
      planRef: 'Sprint 32',
      title: 'Write the release notes',
      dueAt: '2026-08-21',
    });
    expect(card?.primary.argsPatch.draft).toEqual({
      title: 'Write the release notes',
      priority: 'medium',
      dueAt: '2026-08-21T16:59:00.000Z',
    });
  });

  it('dropFields removes an optional draft field (design D17)', async () => {
    const { tool } = buildRev();
    const { card } = await runFirstPass(tool, {
      planRef: 'Sprint 32',
      title: 'Write the release notes',
      dropFields: ['priority'],
    });
    expect(card?.primary.argsPatch.draft).toEqual({ title: 'Write the release notes' });
  });

  it('refuses dropping the title, which the draft schema requires', async () => {
    const { tool } = buildRev();
    const { out, suspend } = await runFirstPass(tool, {
      planRef: 'Sprint 32',
      title: 'Write the release notes',
      dropFields: ['title'],
    });
    expect(suspend).not.toHaveBeenCalled();
    expect(out.refusal).toMatch(/needs a title/i);
  });

  it('refuses an unknown dropFields name', async () => {
    const { tool } = buildRev();
    const { out, suspend } = await runFirstPass(tool, {
      planRef: 'Sprint 32',
      title: 'Write the release notes',
      dropFields: ['deadline'],
    });
    expect(suspend).not.toHaveBeenCalled();
    expect(out.refusal).toMatch(/deadline/);
    expect(out.refusal).toMatch(/dueAt/);
  });

  it('re-gates assertCanCreate on the card plan before suspending (AC5.2)', async () => {
    // planId cannot widen anything — it is fixed — but the re-gate runs anyway,
    // because group membership can change between two turns.
    const { tool } = buildRev({
      assertCanCreate: async () => {
        throw Object.assign(new Error('forbidden'), { code: 'FORBIDDEN' });
      },
    });
    const suspend = vi.fn(async () => {});
    await expect(
      tool.execute!(
        { planRef: 'Sprint 32', title: 'Write the release notes' } as never,
        firstPassCtx(suspend),
      ),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(suspend).not.toHaveBeenCalled();
  });

  it('mints a fresh idempotency key and stamps meta.supersedes', async () => {
    const { tool } = buildRev();
    const { card } = await runFirstPass(tool, {
      planRef: 'Sprint 32',
      title: 'Write the release notes',
    });
    expect(card?.primary.argsPatch.idempotencyKey).not.toBe('old-key');
    expect(card?.meta.supersedes).toBe(OPEN_ID);
  });

  it('re-runs the duplicate check against the MERGED title', async () => {
    // The "use the existing one instead" escape must still match what the card
    // now proposes.
    const { tool, similarTasks } = buildRev();
    await runFirstPass(tool, {
      planRef: 'Sprint 32',
      title: 'Draft the changelog',
    });
    expect(similarTasks.search.mock.calls[0]![0]).toMatchObject({
      queryText: 'Draft the changelog',
    });
  });

  it('proposes a NEW card when the open preview belongs to a different tool (AC3)', async () => {
    // This is AC3's second bullet exactly: "create a task for the release notes"
    // typed while an UPDATE preview waits must go through. A create draft holds no
    // `task:` key, so nothing refuses it and the update card stays confirmable.
    const { tool } = buildRev({
      openPreview: injectedPreview({ toolId: 'planner_updateTask' }),
    });
    const { card } = await runFirstPass(tool, {
      planRef: 'Sprint 32',
      title: 'Write the release notes',
    });
    expect(card?.primary.argsPatch.draft).toMatchObject({ title: 'Write the release notes' });
    expect(card?.meta.supersedes).toBeUndefined();
  });

  it('refuses a card missing its planId rather than rebuilding from half of it', async () => {
    const { tool } = buildRev({
      loaded: {
        approvalId: OPEN_ID,
        toolId: 'planner_createTask',
        argsPatch: { action: 'create', draft: { title: 'x' } },
      },
    });
    const { out, suspend } = await runFirstPass(tool, {
      planRef: 'Sprint 32',
      title: 'Write the release notes',
    });
    expect(suspend).not.toHaveBeenCalled();
    expect(out.refusal).toMatch(/incomplete/i);
  });

  it('never asks the preview port about a task: key — a create card declares none', async () => {
    const { tool, preview } = buildRev({ openPreview: null });
    await runFirstPass(tool, { planRef: 'Sprint 32', title: 'Write the release notes' });
    expect(preview.takenDedupKeys).not.toHaveBeenCalled();
  });
});
