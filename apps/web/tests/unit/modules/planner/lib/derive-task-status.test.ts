import { describe, expect, it } from 'vitest';
import type { DerivedTaskStatus } from '../../../../../src/modules/planner/lib/derive-task-status';
import { deriveTaskStatus } from '../../../../../src/modules/planner/lib/derive-task-status';

describe('deriveTaskStatus', () => {
  it.each<[{ percent_complete: number; is_deferred: boolean }, DerivedTaskStatus]>([
    [{ percent_complete: 0, is_deferred: false }, 'Not started'],
    [{ percent_complete: 1, is_deferred: false }, 'In Progress'],
    [{ percent_complete: 50, is_deferred: false }, 'In Progress'],
    [{ percent_complete: 99, is_deferred: false }, 'In Progress'],
    [{ percent_complete: 100, is_deferred: false }, 'Done'],
    [{ percent_complete: 0, is_deferred: true }, 'Deferred'],
    [{ percent_complete: 60, is_deferred: true }, 'Deferred'],
    [{ percent_complete: 100, is_deferred: true }, 'Done'],
  ])('derives %j → %s', (task, expected) => {
    expect(deriveTaskStatus(task)).toBe(expected);
  });
});
