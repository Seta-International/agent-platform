import { describe, expect, it, vi } from 'vitest';
import type { LoadedPreview } from '../../../../src/backend/orchestration/action/ports.ts';
import {
  DIFFERENT_KIND_OF_CHANGE,
  NOT_THE_OPEN_PREVIEW,
  refuseIfPreviewOpen,
  resolveRevision,
  taskIdsFromArgsPatch,
} from '../../../../src/backend/orchestration/action/revision.ts';

const OPEN_ID = '7f3a1c2e-1111-4222-8333-444455556666';
const OTHER_ID = '11112222-3333-4444-8555-666677778888';
const TASK_A = '66be2be2-394d-4184-b106-c412289fd1e1';
const actor = { tenantId: 't1', actorUserId: 'a1' };

function previewPort(over: { loaded?: LoadedPreview | null; taken?: string[] } = {}) {
  return {
    loadPreview: vi.fn(async (_args: { approvalId: string }) =>
      over.loaded === undefined
        ? {
            approvalId: OPEN_ID,
            toolId: 'planner_updateTask',
            argsPatch: {
              action: 'update',
              targets: [{ taskId: TASK_A, expectedVersion: 4 }],
              patch: { due_at: '2026-08-15T16:59:00.000Z', priority_number: 1 },
              idempotencyKey: 'old-key',
            },
          }
        : over.loaded,
    ),
    takenDedupKeys: vi.fn(async (_args: { dedupKeys: string[] }) => over.taken ?? []),
  };
}

const openPreview = {
  approvalId: OPEN_ID,
  toolId: 'planner_updateTask',
  intent: 'Update "Deploy API"',
  proposedRows: [{ k: 'Due', v: '12 Aug → 15 Aug' }],
};

describe('resolveRevision', () => {
  it('an absent revisionOf is an ordinary new request and is NEVER refused', async () => {
    const preview = previewPort();
    const r = await resolveRevision({
      preview,
      actor,
      revisionOf: undefined,
      openPreview,
      toolId: 'planner_updateTask',
    });
    // AC3's second bullet is expressed exactly this way: a new request alongside
    // an open preview. Refusing it would break "create a task for the release
    // notes" while an update preview is open.
    expect(r).toEqual({ kind: 'new' });
    expect(preview.loadPreview).not.toHaveBeenCalled();
  });

  it('accepts a revisionOf that equals the SERVER-injected id', async () => {
    const r = await resolveRevision({
      preview: previewPort(),
      actor,
      revisionOf: OPEN_ID,
      openPreview,
      toolId: 'planner_updateTask',
    });
    expect(r).toMatchObject({ kind: 'revision', previousApprovalId: OPEN_ID });
  });

  it('refuses a MISMATCHED id without ever loading it (design D15)', async () => {
    const preview = previewPort();
    const r = await resolveRevision({
      preview,
      actor,
      revisionOf: OTHER_ID,
      openPreview,
      toolId: 'planner_updateTask',
    });
    // A valid-but-different approval id of the SAME user would otherwise be a
    // silent retarget: targets come from the card, so "make it Friday" about task
    // A becomes a Friday card for task B, and B's card is voided. That is AC5's
    // first bullet defeated through an open channel.
    expect(r).toEqual({ kind: 'refused', refusal: NOT_THE_OPEN_PREVIEW });
    expect(preview.loadPreview).not.toHaveBeenCalled();
  });

  it('refuses a revisionOf when the server found NO open preview', async () => {
    const r = await resolveRevision({
      preview: previewPort(),
      actor,
      revisionOf: OPEN_ID,
      openPreview: null,
      toolId: 'planner_updateTask',
    });
    expect(r).toEqual({ kind: 'refused', refusal: NOT_THE_OPEN_PREVIEW });
  });

  it('refuses with the SAME sentence when the row is gone, so a uuid in text leaks nothing', async () => {
    const r = await resolveRevision({
      preview: previewPort({ loaded: null }),
      actor,
      revisionOf: OPEN_ID,
      openPreview,
      toolId: 'planner_updateTask',
    });
    expect(r).toEqual({ kind: 'refused', refusal: NOT_THE_OPEN_PREVIEW });
  });

  it('refuses when the open preview belongs to a DIFFERENT tool (design D4)', async () => {
    const r = await resolveRevision({
      preview: previewPort(),
      actor,
      revisionOf: OPEN_ID,
      openPreview,
      // The card says planner_updateTask; the merge tool is asking.
      toolId: 'planner_mergeTasks',
    });
    // Treating this as a new request would supersede the update card and silently
    // lose the due-date change; one card carrying two actions would break the
    // one-card-one-tool-one-idempotency-key contract every tool relies on.
    expect(r).toEqual({ kind: 'refused', refusal: DIFFERENT_KIND_OF_CHANGE });
  });

  it('scopes the load to the acting tenant and user', async () => {
    const preview = previewPort();
    await resolveRevision({
      preview,
      actor,
      revisionOf: OPEN_ID,
      openPreview,
      toolId: 'planner_updateTask',
    });
    expect(preview.loadPreview).toHaveBeenCalledWith({
      tenantId: 't1',
      actorUserId: 'a1',
      approvalId: OPEN_ID,
    });
  });

  it('returns the previous proposal verbatim for the caller to merge onto', async () => {
    const r = await resolveRevision({
      preview: previewPort(),
      actor,
      revisionOf: OPEN_ID,
      openPreview,
      toolId: 'planner_updateTask',
    });
    expect(r).toMatchObject({
      kind: 'revision',
      previousArgsPatch: {
        patch: { due_at: '2026-08-15T16:59:00.000Z', priority_number: 1 },
      },
    });
  });
});

describe('refuseIfPreviewOpen', () => {
  it('returns null when no key is taken', async () => {
    expect(
      await refuseIfPreviewOpen({ preview: previewPort({ taken: [] }), actor, taskIds: [TASK_A] }),
    ).toBeNull();
  });

  it('asks about the task: key for every target', async () => {
    const preview = previewPort({ taken: [] });
    await refuseIfPreviewOpen({ preview, actor, taskIds: [TASK_A, 'b'] });
    expect(preview.takenDedupKeys).toHaveBeenCalledWith({
      tenantId: 't1',
      actorUserId: 'a1',
      dedupKeys: [`task:${TASK_A}`, 'task:b'],
    });
  });

  it('refuses in a sentence when a key is taken, naming no person (design D18)', async () => {
    const refusal = await refuseIfPreviewOpen({
      preview: previewPort({ taken: [`task:${TASK_A}`] }),
      actor,
      taskIds: [TASK_A],
    });
    // The mutex is per TENANT, so the other card may be another approver's. The
    // sentence must not say whose.
    expect(refusal).toMatch(/already a proposal waiting/i);
    expect(refusal).not.toContain('a1');
  });

  it('reads as a plural sentence when several keys are taken', async () => {
    const refusal = await refuseIfPreviewOpen({
      preview: previewPort({ taken: ['task:a', 'task:b'] }),
      actor,
      taskIds: ['a', 'b'],
    });
    expect(refusal).toMatch(/those tasks/i);
  });

  it('asks nothing at all for an empty target list', async () => {
    const preview = previewPort();
    expect(await refuseIfPreviewOpen({ preview, actor, taskIds: [] })).toBeNull();
    expect(preview.takenDedupKeys).not.toHaveBeenCalled();
  });
});

describe('taskIdsFromArgsPatch', () => {
  it('reads the plural targets shape update and bulk both use', () => {
    expect(
      taskIdsFromArgsPatch({
        targets: [
          { taskId: 'a', expectedVersion: 1 },
          { taskId: 'b', expectedVersion: 2 },
        ],
      }),
    ).toEqual(['a', 'b']);
  });

  it('reads the singular taskId shape assign and comment use', () => {
    expect(taskIdsFromArgsPatch({ taskId: 'a' })).toEqual(['a']);
  });

  it('returns [] for a patch with neither, rather than throwing', () => {
    expect(taskIdsFromArgsPatch({ planId: 'p' })).toEqual([]);
    expect(taskIdsFromArgsPatch({ targets: 'nonsense' })).toEqual([]);
    expect(taskIdsFromArgsPatch({ targets: [{ expectedVersion: 1 }] })).toEqual([]);
  });
});
