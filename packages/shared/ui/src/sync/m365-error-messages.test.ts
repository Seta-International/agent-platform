import { describe, expect, it } from 'vitest';
import { humanizePlannerLimitCode, PLANNER_403_LIMIT_MESSAGES } from './m365-error-messages';

describe('humanizePlannerLimitCode', () => {
  it('returns null for null/undefined/empty input', () => {
    expect(humanizePlannerLimitCode(null)).toBeNull();
    expect(humanizePlannerLimitCode(undefined)).toBeNull();
    expect(humanizePlannerLimitCode('')).toBeNull();
  });

  it('returns the mapped message for a known code', () => {
    expect(humanizePlannerLimitCode('MaximumTasksInProject')).toBe(
      'This M365 Planner plan is at its task limit.',
    );
  });

  it('falls back to "Planner declined: <code>" for an unknown code', () => {
    expect(humanizePlannerLimitCode('SomeFutureCode')).toBe('Planner declined: SomeFutureCode');
  });

  it('covers every documented Planner 403 limit code', () => {
    const expected = [
      'MaximumProjectsOwnedByUser',
      'MaximumProjectsSharedWithUser',
      'MaximumTasksCreatedByUser',
      'MaximumTasksAssignedToUser',
      'MaximumTasksInProject',
      'MaximumActiveTasksInProject',
      'MaximumBucketsInProject',
      'MaximumUsersSharedWithProject',
      'MaximumReferencesOnTask',
      'MaximumChecklistItemsOnTask',
      'MaximumAssigneesInTasks',
      'MaximumPlannerPlans',
    ];
    for (const code of expected) {
      expect(PLANNER_403_LIMIT_MESSAGES[code]).toBeDefined();
    }
    expect(Object.keys(PLANNER_403_LIMIT_MESSAGES).sort()).toEqual([...expected].sort());
  });
});
