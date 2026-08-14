import { describe, expect, it, vi } from 'vitest';
import type { LoadedPreview } from '../../../../src/backend/orchestration/action/ports.ts';
import {
  dropNoOps,
  refuseIfPreviewOpen,
  resolveRevision,
  taskIdsFromArgsPatch,
} from '../../../../src/backend/orchestration/action/revision.ts';
import type { ActionTaskSnapshot } from '../../../../src/backend/orchestration/action/schemas.ts';

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
  taskIds: [TASK_A],
  proposedRows: [{ k: 'Due', v: '12 Aug → 15 Aug' }],
};

describe('resolveRevision derives the revision from server state', () => {
  it('is a new request when the server found NO open preview', async () => {
    const preview = previewPort();
    const r = await resolveRevision({
      preview,
      actor,
      openPreview: null,
      toolId: 'planner_updateTask',
      resolvedTaskIds: [TASK_A],
    });
    expect(r).toEqual({ kind: 'new' });
    expect(preview.loadPreview).not.toHaveBeenCalled();
  });

  it('adjusts the open preview when the turn named no task at all', async () => {
    const preview = previewPort();
    const r = await resolveRevision({
      preview,
      actor,
      openPreview,
      toolId: 'planner_updateTask',
      resolvedTaskIds: [],
    });
    expect(r).toMatchObject({ kind: 'revision', previousApprovalId: OPEN_ID });
  });

  it('adjusts the open preview when the turn named the SAME task', async () => {
    const r = await resolveRevision({
      preview: previewPort(),
      actor,
      openPreview,
      toolId: 'planner_updateTask',
      resolvedTaskIds: [TASK_A],
    });
    expect(r).toMatchObject({ kind: 'revision', previousApprovalId: OPEN_ID });
  });

  it('matches the task set regardless of order', async () => {
    const r = await resolveRevision({
      preview: previewPort(),
      actor,
      openPreview: { ...openPreview, taskIds: [TASK_A, 'b'] },
      toolId: 'planner_updateTask',
      resolvedTaskIds: ['b', TASK_A],
    });
    expect(r).toMatchObject({ kind: 'revision' });
  });

  it('is a NEW request when the turn named a DIFFERENT task, without loading', async () => {
    const preview = previewPort();
    const r = await resolveRevision({
      preview,
      actor,
      openPreview,
      toolId: 'planner_updateTask',
      resolvedTaskIds: [OTHER_ID],
    });
    // The check design D15 never had: when the model names a task explicitly, a
    // mismatch falls through to a new card instead of adjusting whichever card
    // happened to be newest. Decided BEFORE the load, so it costs no query.
    expect(r).toEqual({ kind: 'new' });
    expect(preview.loadPreview).not.toHaveBeenCalled();
  });

  it('is a NEW request when ANOTHER TOOL owns the open card (design D4)', async () => {
    const r = await resolveRevision({
      preview: previewPort(),
      actor,
      openPreview,
      // The card says planner_updateTask; the merge tool is asking.
      toolId: 'planner_mergeTasks',
      resolvedTaskIds: [TASK_A],
    });
    // Falling through to `new` is what lets the task: mutex produce the design-D4
    // sentence, and what lets "create a task for the release notes" through.
    expect(r).toEqual({ kind: 'new' });
  });

  it('is a NEW request when the row vanished between the lookup and the call', async () => {
    const r = await resolveRevision({
      preview: previewPort({ loaded: null }),
      actor,
      openPreview,
      toolId: 'planner_updateTask',
      resolvedTaskIds: [],
    });
    expect(r).toEqual({ kind: 'new' });
  });

  it('scopes the load to the acting tenant and user', async () => {
    const preview = previewPort();
    await resolveRevision({
      preview,
      actor,
      openPreview,
      toolId: 'planner_updateTask',
      resolvedTaskIds: [TASK_A],
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
      openPreview,
      toolId: 'planner_updateTask',
      resolvedTaskIds: [TASK_A],
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

  it('does NOT refuse when a reuse key is already taken (FUT-806 precedence)', async () => {
    // The writer evaluates a card's keys in declaration order and the FIRST hit
    // wins. An assign card declares `assign:` before `task:`, so a pending assign
    // proposal RESOLVES as reuse rather than clashing. A pre-check that asked
    // only about `task:` would refuse the very case the writer handles, and
    // FUT-806's "a second assignment request reuses the open card" would be gone.
    const preview = previewPort({ taken: [`assign:${TASK_A}`, `task:${TASK_A}`] });
    const refusal = await refuseIfPreviewOpen({
      preview,
      actor,
      taskIds: [TASK_A],
      reuseKeys: [`assign:${TASK_A}`],
    });
    expect(refusal).toBeNull();
  });

  it('still refuses when the task key is held by a card that is NOT reusable', async () => {
    // A pending UPDATE card holds `task:`, and no assign proposal exists. The
    // writer would fall through to `task:` and throw; refusing in a sentence here
    // is the courtesy that turns that into an explanation.
    const refusal = await refuseIfPreviewOpen({
      preview: previewPort({ taken: [`task:${TASK_A}`] }),
      actor,
      taskIds: [TASK_A],
      reuseKeys: [`assign:${TASK_A}`],
    });
    expect(refusal).toMatch(/already a proposal waiting/i);
  });

  it('asks about the reuse keys and the task keys in ONE round trip', async () => {
    const preview = previewPort({ taken: [] });
    await refuseIfPreviewOpen({
      preview,
      actor,
      taskIds: [TASK_A],
      reuseKeys: [`assign:${TASK_A}`],
    });
    expect(preview.takenDedupKeys).toHaveBeenCalledWith({
      tenantId: 't1',
      actorUserId: 'a1',
      dedupKeys: [`assign:${TASK_A}`, `task:${TASK_A}`],
    });
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

  it('reads both link endpoints', () => {
    expect(taskIdsFromArgsPatch({ sourceTaskId: 'a', targetTaskId: 'b' })).toEqual(['a', 'b']);
  });

  it('reads both merge endpoints', () => {
    expect(taskIdsFromArgsPatch({ duplicateTaskId: 'a', keepTaskId: 'b' })).toEqual(['a', 'b']);
  });

  it('returns nothing for a create draft, which has no task yet', () => {
    expect(taskIdsFromArgsPatch({ draft: { title: 'x' } })).toEqual([]);
  });

  it('returns [] for a patch with neither, rather than throwing', () => {
    expect(taskIdsFromArgsPatch({ planId: 'p' })).toEqual([]);
    expect(taskIdsFromArgsPatch({ targets: 'nonsense' })).toEqual([]);
    expect(taskIdsFromArgsPatch({ targets: [{ expectedVersion: 1 }] })).toEqual([]);
  });
});

const SNAP: ActionTaskSnapshot = {
  taskId: 'a',
  title: 'Implement Hiring screen',
  description: null,
  due_at: '2026-08-14T16:59:00.000Z',
  start_at: null,
  priority_number: 5,
  percent_complete: 50,
  version: 8,
  groupId: 'g1',
};

describe('dropNoOps', () => {
  it('removes a field whose value already equals the stored one', () => {
    // The production case: the model read the task, then echoed percent_complete back.
    expect(dropNoOps({ due_at: '2026-08-15T16:59:00.000Z', percent_complete: 50 }, [SNAP])).toEqual(
      {
        due_at: '2026-08-15T16:59:00.000Z',
      },
    );
  });

  it('keeps a field that really changes', () => {
    expect(dropNoOps({ percent_complete: 100 }, [SNAP])).toEqual({ percent_complete: 100 });
  });

  it('compares dates as instants, not strings', () => {
    expect(dropNoOps({ due_at: '2026-08-14T23:59:00+07:00' }, [SNAP])).toEqual({});
  });

  it('keeps a null that genuinely clears a set value', () => {
    expect(dropNoOps({ due_at: null }, [SNAP])).toEqual({ due_at: null });
  });

  it('drops a null that clears an already-empty field', () => {
    expect(dropNoOps({ start_at: null }, [SNAP])).toEqual({});
  });

  it('keeps a field that is a no-op for one task but not for another', () => {
    const other = { ...SNAP, taskId: 'b', percent_complete: 0 };
    expect(dropNoOps({ percent_complete: 50 }, [SNAP, other])).toEqual({ percent_complete: 50 });
  });
});
