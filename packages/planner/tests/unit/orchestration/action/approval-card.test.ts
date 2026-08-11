import { describe, expect, it } from 'vitest';
import {
  buildAssignTaskApprovalCard,
  buildBulkApprovalCard,
  buildCreateTaskApprovalCard,
  buildLinkApprovalCard,
  buildMergeApprovalCard,
  buildUpdateApprovalCard,
} from '../../../../src/backend/orchestration/action/approval-card.ts';
import type { ActionTaskSnapshot } from '../../../../src/backend/orchestration/action/schemas.ts';

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

function build(patch: Parameters<typeof buildUpdateApprovalCard>[0]['patch']) {
  return buildUpdateApprovalCard({
    task: snapshot,
    patch,
    tenantId: 't1',
    userId: 'u1',
    idempotencyKey: 'key-1',
  });
}

function kvRows(card: ReturnType<typeof build>) {
  const block = card.details.find((d) => d.kind === 'kvTable');
  return (block as { rows: { k: string; v: string }[] }).rows;
}

describe('buildUpdateApprovalCard', () => {
  it('renders one old → new row per changed field, as display strings', () => {
    expect(kvRows(build({ due_at: '2026-08-15T16:59:00.000Z' }))).toEqual([
      { k: 'Due', v: '12 Aug 2026 23:59 → 15 Aug 2026 23:59' },
    ]);
  });

  it('renders priority and progress as labels, never as numbers', () => {
    expect(kvRows(build({ priority_number: 1, percent_complete: 100 }))).toEqual([
      { k: 'Priority', v: 'Medium → Urgent' },
      { k: 'Progress', v: 'Not started → Completed' },
    ]);
  });

  it('renders a cleared value as "(empty)" rather than null', () => {
    expect(kvRows(build({ due_at: null }))).toEqual([
      { k: 'Due', v: '12 Aug 2026 23:59 → (empty)' },
    ]);
  });

  it('renders a value set from nothing', () => {
    expect(kvRows(build({ start_at: '2026-08-10T17:00:00.000Z' }))).toEqual([
      { k: 'Start', v: '(empty) → 11 Aug 2026 00:00' },
    ]);
  });

  it('carries expectedVersion and idempotencyKey on BOTH actions — they are the only way those survive the confirm boundary', () => {
    const card = build({ due_at: '2026-08-15T16:59:00.000Z' });
    expect(card.primary.argsPatch).toEqual({
      action: 'update',
      targets: [{ taskId: TASK_ID, expectedVersion: 4 }],
      patch: { due_at: '2026-08-15T16:59:00.000Z' },
      idempotencyKey: 'key-1',
    });
    expect(card.decline.argsPatch).toEqual({
      action: 'decline',
      targets: [{ taskId: TASK_ID, expectedVersion: 4 }],
      idempotencyKey: 'key-1',
    });
  });

  it('offers no alternates — an update has no alternative to choose between', () => {
    expect(build({ title: 'New title' }).alternates).toEqual([]);
  });

  it('leaks no raw identifier into anything the user reads', () => {
    const card = build({ title: 'New title' });
    const visible = JSON.stringify([card.intent, card.summary, card.details, card.primary.label]);
    expect(visible).not.toContain(TASK_ID);
    expect(visible).not.toContain(GROUP_ID);
  });

  it('throws on an empty patch — an empty preview must never reach the user', () => {
    expect(() => build({})).toThrow(/no changes/i);
  });
});

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function snap(over: Partial<ActionTaskSnapshot> = {}): ActionTaskSnapshot {
  return {
    taskId: '66be2be2-394d-4184-b106-c412289fd1e1',
    title: 'Alpha',
    description: null,
    due_at: null,
    start_at: null,
    priority_number: 5,
    percent_complete: 0,
    version: 4,
    groupId: 'aa11bb22-cc33-4d44-8e55-ff6677889900',
    ...over,
  };
}

describe('buildBulkApprovalCard', () => {
  const base = { tenantId: 't1', userId: 'u1', idempotencyKey: 'key-1' };

  it('renders one row per task, labelled by title, with the count in the summary', () => {
    const card = buildBulkApprovalCard({
      ...base,
      tasks: [
        snap({ taskId: 'id-a', title: 'Alpha', percent_complete: 0 }),
        snap({ taskId: 'id-b', title: 'Beta', percent_complete: 50 }),
        snap({ taskId: 'id-c', title: 'Gamma', percent_complete: 0 }),
      ],
      patch: { percent_complete: 100 },
    });
    const block = card.details[0] as { kind: string; rows: Array<{ k: string; v: string }> };
    expect(block.kind).toBe('kvTable');
    expect(block.rows).toEqual([
      { k: 'Alpha', v: 'Not started → Completed' },
      { k: 'Beta', v: 'In progress → Completed' },
      { k: 'Gamma', v: 'Not started → Completed' },
    ]);
    expect(card.summary).toBe('3 tasks will change.');
    expect(card.riskBadge).toBe('write');
  });

  it('labels each field when more than one changes', () => {
    const card = buildBulkApprovalCard({
      ...base,
      tasks: [snap({ title: 'Alpha', priority_number: 5, percent_complete: 0 })],
      patch: { priority_number: 1, percent_complete: 100 },
    });
    const block = card.details[0] as { rows: Array<{ k: string; v: string }> };
    expect(block.rows[0]!.v).toBe('Priority: Medium → Urgent; Progress: Not started → Completed');
  });

  it('never shows a stored number or a UUID', () => {
    const card = buildBulkApprovalCard({
      ...base,
      tasks: [snap({ taskId: 'id-a', title: 'Alpha' }), snap({ taskId: 'id-b', title: 'Beta' })],
      patch: { priority_number: 1 },
    });
    const rendered = JSON.stringify(card.details);
    expect(rendered).not.toMatch(UUID_RE);
    expect(rendered).toContain('Urgent');
    expect(rendered).not.toContain('"1"');
  });

  it('clips a long title so the card stays readable', () => {
    const card = buildBulkApprovalCard({
      ...base,
      tasks: [snap({ title: 'x'.repeat(200) }), snap({ taskId: 'id-b', title: 'Beta' })],
      patch: { percent_complete: 100 },
    });
    const block = card.details[0] as { rows: Array<{ k: string }> };
    expect(block.rows[0]!.k).toHaveLength(60);
    expect(block.rows[0]!.k.endsWith('…')).toBe(true);
  });

  it('carries targets AND the idempotency key on BOTH primary and decline', () => {
    const card = buildBulkApprovalCard({
      ...base,
      tasks: [snap({ taskId: 'id-a', version: 4 }), snap({ taskId: 'id-b', version: 9 })],
      patch: { percent_complete: 100 },
    });
    const targets = [
      { taskId: 'id-a', expectedVersion: 4 },
      { taskId: 'id-b', expectedVersion: 9 },
    ];
    expect(card.primary.argsPatch).toEqual({
      action: 'update',
      targets,
      patch: { percent_complete: 100 },
      idempotencyKey: 'key-1',
    });
    expect(card.decline.argsPatch).toEqual({
      action: 'decline',
      targets,
      idempotencyKey: 'key-1',
    });
  });
});

describe('buildUpdateApprovalCard — one target, batch argsPatch', () => {
  it('uses the same targets[] shape as a batch', () => {
    const card = buildUpdateApprovalCard({
      task: snap({ taskId: 'id-a', version: 4 }),
      patch: { percent_complete: 100 },
      tenantId: 't1',
      userId: 'u1',
      idempotencyKey: 'key-1',
    });
    expect(card.primary.argsPatch).toEqual({
      action: 'update',
      targets: [{ taskId: 'id-a', expectedVersion: 4 }],
      patch: { percent_complete: 100 },
      idempotencyKey: 'key-1',
    });
    expect(card.decline.argsPatch).toEqual({
      action: 'decline',
      targets: [{ taskId: 'id-a', expectedVersion: 4 }],
      idempotencyKey: 'key-1',
    });
  });
});

describe('buildLinkApprovalCard', () => {
  const base = {
    source: snap({ taskId: 'id-a', title: 'Alpha' }),
    target: snap({ taskId: 'id-b', title: 'Beta' }),
    tenantId: 't1',
    userId: 'u1',
    idempotencyKey: 'key-1',
  };

  it('shows From / To / Relationship as titles, never ids', () => {
    const card = buildLinkApprovalCard({ ...base, kind: 'duplicates' });
    const block = card.details[0] as { kind: string; rows: Array<{ k: string; v: string }> };
    expect(block.kind).toBe('kvTable');
    expect(block.rows).toEqual([
      { k: 'From', v: 'Alpha' },
      { k: 'To', v: 'Beta' },
      { k: 'Relationship', v: 'Alpha is a duplicate of Beta' },
    ]);
    expect(JSON.stringify(card.details)).not.toMatch(UUID_RE);
  });

  it('is a write, not a destructive change — nothing is deleted by a link', () => {
    const card = buildLinkApprovalCard({ ...base, kind: 'relates' });
    expect(card.riskBadge).toBe('write');
  });

  it('carries ids and the key on both primary and decline', () => {
    const card = buildLinkApprovalCard({ ...base, kind: 'blocks' });
    expect(card.primary.argsPatch).toEqual({
      action: 'link',
      sourceTaskId: 'id-a',
      targetTaskId: 'id-b',
      kind: 'blocks',
      idempotencyKey: 'key-1',
    });
    expect(card.decline.argsPatch).toEqual({
      action: 'decline',
      sourceTaskId: 'id-a',
      targetTaskId: 'id-b',
      kind: 'blocks',
      idempotencyKey: 'key-1',
    });
  });
});

describe('buildMergeApprovalCard', () => {
  const mergeSnap = (over: Partial<ActionTaskSnapshot>): ActionTaskSnapshot => ({
    ...snapshot,
    ...over,
  });
  const base = {
    duplicate: mergeSnap({ taskId: 'id-a', title: 'Draft the migration doc', version: 3 }),
    keep: mergeSnap({ taskId: 'id-b', title: 'Migration doc' }),
    tenantId: 't1',
    userId: 'u1',
    idempotencyKey: 'key-1',
  };

  it('is destructive — a task ends up in the trash', () => {
    expect(buildMergeApprovalCard(base).riskBadge).toBe('destructive');
  });

  it('names which task dies and which survives, by title', () => {
    const card = buildMergeApprovalCard(base);
    const block = card.details[0] as { kind: string; rows: Array<{ k: string; v: string }> };
    expect(block.kind).toBe('kvTable');
    expect(block.rows).toEqual([
      { k: 'Moved to trash', v: 'Draft the migration doc' },
      { k: 'Kept', v: 'Migration doc' },
      {
        k: 'Also',
        v: '"Draft the migration doc" will be marked as a duplicate of "Migration doc"',
      },
    ]);
    expect(JSON.stringify(card.details)).not.toMatch(UUID_RE);
  });

  // Restore brings the task back but the `duplicates` link SURVIVES the restore,
  // so undo is not a clean unmerge. Saying "reversible" would be a lie.
  it('promises restore-from-trash and never promises reversibility', () => {
    const card = buildMergeApprovalCard(base);
    expect(card.summary).toMatch(/restored from trash/i);
    expect(JSON.stringify(card)).not.toMatch(/reversible|undo/i);
  });

  it('carries only the duplicate\u2019s version on primary and decline', () => {
    const card = buildMergeApprovalCard(base);
    const expected = {
      duplicateTaskId: 'id-a',
      duplicateExpectedVersion: 3,
      keepTaskId: 'id-b',
      idempotencyKey: 'key-1',
    };
    expect(card.primary.argsPatch).toEqual({ action: 'merge', ...expected });
    expect(card.decline.argsPatch).toEqual({ action: 'decline', ...expected });
  });
});

// FUT-820: the card names the runtime that must resume it. /chat/resume picks the
// resume BODY SCHEMA off the persisted row's workflow_id, so a card that does not
// say "planner.action" gets validated against the legacy assignment contract and
// the user's Confirm is rejected — silently, because the card host renders no error.
describe('action cards declare their resume runtime', () => {
  const snap = (over: Partial<ActionTaskSnapshot>): ActionTaskSnapshot => ({
    ...snapshot,
    ...over,
  });
  const ids = { tenantId: 't1', userId: 'u1', idempotencyKey: 'key-1' };

  it('buildUpdateApprovalCard declares planner.action', () => {
    expect(build({ percent_complete: 100 }).meta.workflowId).toBe('planner.action');
  });

  it('buildBulkApprovalCard declares planner.action', () => {
    const card = buildBulkApprovalCard({
      ...ids,
      tasks: [snap({ taskId: 'id-a', title: 'Alpha' })],
      patch: { percent_complete: 100 },
    });
    expect(card.meta.workflowId).toBe('planner.action');
  });

  it('buildLinkApprovalCard declares planner.action', () => {
    const card = buildLinkApprovalCard({
      source: snap({ taskId: 'id-a', title: 'Alpha' }),
      target: snap({ taskId: 'id-b', title: 'Beta' }),
      kind: 'relates',
      ...ids,
    });
    expect(card.meta.workflowId).toBe('planner.action');
  });

  it('buildMergeApprovalCard declares planner.action', () => {
    const card = buildMergeApprovalCard({
      duplicate: snap({ taskId: 'id-a', title: 'Alpha' }),
      keep: snap({ taskId: 'id-b', title: 'Beta' }),
      ...ids,
    });
    expect(card.meta.workflowId).toBe('planner.action');
  });
});

describe('buildAssignTaskApprovalCard', () => {
  const base = {
    taskId: 'id-a',
    title: 'Deploy hiring screen',
    before: [{ userId: 'u-b', name: 'B\u00ecnh' }],
    after: [{ userId: 'u-a', name: 'Tu\u1ea5n' }],
    tenantId: 't1',
    userId: 'u1',
    idempotencyKey: 'key-1',
  };

  it('shows who owns it now and who will own it after, by name', () => {
    const card = buildAssignTaskApprovalCard(base);
    const block = card.details[0] as { kind: string; rows: Array<{ k: string; v: string }> };
    expect(block.kind).toBe('kvTable');
    expect(block.rows).toEqual([
      { k: 'Task', v: 'Deploy hiring screen' },
      { k: 'Now', v: 'B\u00ecnh' },
      { k: 'After', v: 'Tu\u1ea5n' },
    ]);
    expect(JSON.stringify(card.details)).not.toMatch(UUID_RE);
  });

  it('says "Nobody" rather than showing an empty row', () => {
    const card = buildAssignTaskApprovalCard({ ...base, before: [] });
    const block = card.details[0] as { rows: Array<{ k: string; v: string }> };
    expect(block.rows[1]).toEqual({ k: 'Now', v: 'Nobody' });
  });

  // D11. THE regression test for "a user-named assign never proposes somebody
  // else": no alternates, and no entityList, which is what makes the D12
  // renderer show confirm/cancel instead of candidate rows.
  it('offers no alternatives and no candidate list', () => {
    const card = buildAssignTaskApprovalCard(base);
    expect(card.alternates).toEqual([]);
    expect(card.details.some((b) => b.kind === 'entityList')).toBe(false);
  });

  it('carries the final set and the key on primary and decline', () => {
    const card = buildAssignTaskApprovalCard({
      ...base,
      after: [
        { userId: 'u-a', name: 'Tu\u1ea5n' },
        { userId: 'u-c', name: 'Chi' },
      ],
    });
    expect(card.primary.argsPatch).toEqual({
      action: 'assign',
      taskId: 'id-a',
      assigneeUserIds: ['u-a', 'u-c'],
      idempotencyKey: 'key-1',
    });
    expect(card.decline.argsPatch).toEqual({
      action: 'decline',
      taskId: 'id-a',
      idempotencyKey: 'key-1',
    });
  });

  // Plan 01's mechanism: this card and the recommend card must not coexist.
  it('declares the assign mutex for its task', () => {
    expect(buildAssignTaskApprovalCard(base).meta.dedupKey).toBe('assign:id-a');
  });

  it('is a write, not a destructive change', () => {
    expect(buildAssignTaskApprovalCard(base).riskBadge).toBe('write');
  });
});

describe('buildCreateTaskApprovalCard', () => {
  const base = {
    planId: 'plan-1',
    planName: 'Sprint 32',
    draft: {
      title: 'Deploy hiring screen',
      description: 'behind the flag',
      dueAt: '2026-08-14T17:00:00+07:00',
      priority: 'urgent' as const,
      labels: ['infra'],
    },
    similar: [] as Array<{ taskId: string; title: string; score: number }>,
    tenantId: 't1',
    userId: 'u1',
    idempotencyKey: 'key-1',
  };

  it('previews every field the user gave, and omits the ones they did not', () => {
    const card = buildCreateTaskApprovalCard(base);
    const block = card.details[0] as { kind: string; rows: Array<{ k: string; v: string }> };
    expect(block.kind).toBe('kvTable');
    const keys = block.rows.map((r) => r.k);
    expect(keys).toContain('Title');
    expect(keys).toContain('Plan');
    expect(keys).toContain('Due');
    expect(keys).toContain('Priority');
    expect(keys).toContain('Labels');
    // No startAt was given, so no empty row for it.
    expect(keys).not.toContain('Start');
    expect(JSON.stringify(card.details)).not.toMatch(UUID_RE);
  });

  it('carries the whole draft on the primary patch, so resume converts nothing', () => {
    const card = buildCreateTaskApprovalCard(base);
    expect(card.primary.argsPatch).toEqual({
      action: 'create',
      planId: 'plan-1',
      draft: base.draft,
      idempotencyKey: 'key-1',
    });
  });

  it('has no alternates when nothing similar was found', () => {
    expect(buildCreateTaskApprovalCard(base).alternates).toEqual([]);
  });

  it('offers each similar task as a use_existing branch, at most three', () => {
    const card = buildCreateTaskApprovalCard({
      ...base,
      similar: [
        { taskId: 't-1', title: 'Deploy hiring screen v2', score: 0.9 },
        { taskId: 't-2', title: 'Hiring screen deploy', score: 0.8 },
        { taskId: 't-3', title: 'Screen deploy', score: 0.7 },
        { taskId: 't-4', title: 'Deploy something', score: 0.6 },
      ],
    });
    expect(card.alternates).toHaveLength(3);
    expect(card.alternates[0]).toEqual({
      label: 'Use "Deploy hiring screen v2"',
      argsPatch: { action: 'use_existing', existingTaskId: 't-1', idempotencyKey: 'key-1' },
    });
  });

  it('says how many similar tasks it found', () => {
    const card = buildCreateTaskApprovalCard({
      ...base,
      similar: [{ taskId: 't-1', title: 'Deploy hiring screen v2', score: 0.9 }],
    });
    expect(JSON.stringify(card.details)).toMatch(/similar/i);
  });

  // D12: alternates render as secondary buttons only when there is no
  // entityList. A candidate list here would make this a pick-one-of-N card.
  it('renders no entityList', () => {
    expect(
      buildCreateTaskApprovalCard({
        ...base,
        similar: [{ taskId: 't-1', title: 'x', score: 0.9 }],
      }).details.some((b) => b.kind === 'entityList'),
    ).toBe(false);
  });

  it('is a write, not a destructive change', () => {
    expect(buildCreateTaskApprovalCard(base).riskBadge).toBe('write');
  });
});
