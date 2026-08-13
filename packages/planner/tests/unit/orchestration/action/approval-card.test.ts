import { describe, expect, it } from 'vitest';
import { buildUpdateApprovalCard } from '../../../../src/backend/orchestration/action/approval-card.ts';
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
      taskId: TASK_ID,
      patch: { due_at: '2026-08-15T16:59:00.000Z' },
      expectedVersion: 4,
      idempotencyKey: 'key-1',
    });
    expect(card.decline.argsPatch).toEqual({
      action: 'decline',
      taskId: TASK_ID,
      expectedVersion: 4,
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
