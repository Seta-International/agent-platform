// intentional duplicate of @seta/integrations error-mapping for the front-end
// (kept in sync manually; the integrations package is server-only)

export const PLANNER_403_LIMIT_MESSAGES: Record<string, string> = {
  MaximumProjectsOwnedByUser: 'The user owns the maximum number of plans allowed (200).',
  MaximumProjectsSharedWithUser: 'The user is at the maximum shared-plan limit.',
  MaximumTasksCreatedByUser: 'The user is at the maximum tasks-created limit.',
  MaximumTasksAssignedToUser: 'The user has the maximum tasks assigned (~150).',
  MaximumTasksInProject: 'This M365 Planner plan is at its task limit.',
  MaximumActiveTasksInProject: 'This plan is at its active-task limit.',
  MaximumBucketsInProject: 'This plan is at its bucket limit (~200).',
  MaximumUsersSharedWithProject: 'This plan is at the shared-users limit.',
  MaximumReferencesOnTask: 'This task is at the references limit.',
  MaximumChecklistItemsOnTask: 'This task is at the checklist-items limit (20).',
  MaximumAssigneesInTasks: 'This task is at the assignees limit (~20).',
  MaximumPlannerPlans: 'This group is at the plans limit (200).',
};

export function humanizePlannerLimitCode(code: string | null | undefined): string | null {
  if (!code) return null;
  return PLANNER_403_LIMIT_MESSAGES[code] ?? `Planner declined: ${code}`;
}
