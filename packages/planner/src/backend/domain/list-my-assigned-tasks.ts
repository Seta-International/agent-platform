import type { SessionScope } from '@seta/core';
import type { TaskWithAssigneesRow } from '../dto.ts';
import type { ListTasksFilters } from './list-tasks.ts';
import { listTasks } from './list-tasks.ts';

export async function listMyAssignedTasks(input: {
  session: SessionScope;
  filters?: Pick<ListTasksFilters, 'review_state' | 'progress' | 'due_before' | 'include_deleted'>;
  limit?: number;
  cursor?: string;
}): Promise<{ tasks: TaskWithAssigneesRow[]; next_cursor?: string }> {
  return listTasks({
    filters: {
      ...input.filters,
      assignee_id: input.session.user_id,
    },
    limit: input.limit,
    cursor: input.cursor,
    session: input.session,
  });
}
