import { describe, expect, it } from 'vitest';
import { isSignificant } from '../../src/backend/domain/activity-significance.ts';

describe('isSignificant', () => {
  it('keeps an in-plan column move (bucket changed)', () => {
    expect(
      isSignificant('planner.task.moved', {
        before: { bucket_id: 'b1', order_hint: 'a' },
        after: { bucket_id: 'b2', order_hint: 'b' },
      }),
    ).toBe(true);
  });

  it('drops a same-bucket reorder (only order changed)', () => {
    expect(
      isSignificant('planner.task.moved', {
        before: { bucket_id: 'b1', order_hint: 'a' },
        after: { bucket_id: 'b1', order_hint: 'c' },
      }),
    ).toBe(false);
  });

  it('keeps a cross-plan move', () => {
    expect(
      isSignificant('planner.task.moved', {
        from_plan_id: 'p1',
        to_plan_id: 'p2',
        before: { bucket_id: 'b1' },
        after: { bucket_id: 'b9' },
      }),
    ).toBe(true);
  });

  it('drops the task.updated move-twin (only order/bucket/plan fields)', () => {
    expect(
      isSignificant('planner.task.updated', {
        changed_fields: ['order_hint', 'bucket_id'],
      }),
    ).toBe(false);
  });

  it('keeps a real task.updated edit (due_at)', () => {
    expect(
      isSignificant('planner.task.updated', {
        changed_fields: ['due_at'],
      }),
    ).toBe(true);
  });

  it('keeps task.updated with empty/missing changed_fields (defensive)', () => {
    expect(isSignificant('planner.task.updated', { changed_fields: [] })).toBe(true);
    expect(isSignificant('planner.task.updated', {})).toBe(true);
  });

  it('keeps unrelated event types', () => {
    expect(isSignificant('planner.task.created', {})).toBe(true);
    expect(isSignificant('planner.group.member.added', {})).toBe(true);
  });
});
