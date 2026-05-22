import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { MyTasksPage } from '@/modules/planner/pages/my-tasks-page';
import type { MyTasksFilters } from '@/modules/planner/state/query-keys';

const searchSchema = z.object({
  planId: z.string().optional(),
  groupId: z.string().optional(),
  priority: z.coerce
    .number()
    .refine((n) => n === 1 || n === 3 || n === 5 || n === 9)
    .optional(),
  due: z.enum(['overdue', 'this_week', 'no_date']).optional(),
  view: z.enum(['list', 'grid']).default('list'),
  sort: z.enum(['assignee_priority', 'due_at']).default('assignee_priority'),
  q: z.string().optional(),
});

export const Route = createFileRoute('/_authed/planner/my-tasks')({
  validateSearch: searchSchema.parse,
  component: MyTasksRoute,
});

function MyTasksRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const filters: MyTasksFilters = {
    planId: search.planId,
    groupId: search.groupId,
    priority: search.priority as 1 | 3 | 5 | 9 | undefined,
    due: search.due,
    view: search.view,
    sort: search.sort,
    search: search.q,
  };
  return (
    <MyTasksPage
      filters={filters}
      onFiltersChange={(next) => {
        void navigate({
          to: '/planner/my-tasks',
          search: {
            planId: next.planId,
            groupId: next.groupId,
            priority: next.priority,
            due: next.due,
            view: next.view ?? 'list',
            sort: next.sort ?? 'assignee_priority',
            q: next.search,
          },
          replace: true,
        });
      }}
    />
  );
}
