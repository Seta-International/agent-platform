import { describe, expect, it } from 'vitest';
import { dropsFor } from '../../../../src/backend/orchestration/action/update-task.tool.ts';

describe('dropsFor', () => {
  it('drops nothing when the user is adding to the proposal', () => {
    expect(
      dropsFor({ due_at: 'x', percent_complete: 100 }, { priority_number: 1 }, undefined, false),
    ).toEqual([]);
  });

  it('drops the previous fields the user did not restate when correcting', () => {
    // The production failure: the proposal was due 15/08 + status Completed, and
    // "không phải, ý tôi là đổi ngày quá hạn thôi" must leave only the date.
    expect(
      dropsFor({ due_at: 'x', percent_complete: 100 }, { due_at: 'y' }, undefined, true),
    ).toEqual(['status']);
  });

  it('keeps a field the user restated even when correcting', () => {
    expect(
      dropsFor({ due_at: 'x', percent_complete: 100 }, { percent_complete: 0 }, undefined, true),
    ).toEqual(['dueAt']);
  });

  it('unions the model dropFields with the computed ones', () => {
    expect(dropsFor({ due_at: 'x', priority_number: 1 }, { due_at: 'y' }, ['title'], true)).toEqual(
      ['title', 'priority'],
    );
  });

  it('passes model dropFields straight through when not correcting', () => {
    expect(dropsFor({ due_at: 'x' }, { title: 't' }, ['priority'], undefined)).toEqual([
      'priority',
    ]);
  });
});
