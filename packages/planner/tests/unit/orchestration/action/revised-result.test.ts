import { describe, expect, it } from 'vitest';
import { renderPatchDiff } from '../../../../src/backend/orchestration/action/revised-result.ts';
import type { ActionTaskSnapshot } from '../../../../src/backend/orchestration/action/schemas.ts';

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

describe('renderPatchDiff', () => {
  it('names the weekday so the model never has to work it out', () => {
    // 2026-08-15 is a SATURDAY. Production wrote "Thứ Hai".
    expect(renderPatchDiff({ due_at: '2026-08-15T16:59:00.000Z' }, SNAP)).toEqual([
      { field: 'dueAt', from: 'thứ Sáu 14/08/2026', to: 'thứ Bảy 15/08/2026' },
    ]);
  });

  it('renders a cleared date as an explicit absence, not an empty string', () => {
    expect(renderPatchDiff({ due_at: null }, SNAP)).toEqual([
      { field: 'dueAt', from: 'thứ Sáu 14/08/2026', to: 'không có' },
    ]);
  });

  it('renders priority and status as the words the model uses', () => {
    expect(renderPatchDiff({ priority_number: 1, percent_complete: 100 }, SNAP)).toEqual([
      { field: 'priority', from: 'medium', to: 'urgent' },
      { field: 'status', from: 'in_progress', to: 'completed' },
    ]);
  });

  it('omits a field the patch does not carry', () => {
    expect(renderPatchDiff({ title: 'Hiring screen v2' }, SNAP)).toEqual([
      { field: 'title', from: 'Implement Hiring screen', to: 'Hiring screen v2' },
    ]);
  });
});
