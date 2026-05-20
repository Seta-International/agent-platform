import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { PlanGridPage } from '@/modules/planner/pages/plan-grid-page';
import { PlanPage } from '@/modules/planner/pages/plan-page';
import { TaskSheetContainer } from '@/modules/planner/pages/task-sheet-container';
import {
  parseFiltersFromSearch,
  parseGroupBy,
  parseViewMode,
  serializeFiltersToSearch,
} from '@/modules/planner/state/url-state';

const searchSchema = z.object({
  view: z.enum(['board', 'grid']).optional(),
  groupBy: z.enum(['bucket', 'assignee', 'priority', 'due', 'label']).optional(),
  task: z.string().uuid().optional(),
  'filter.assignee': z.string().optional(),
  'filter.label': z.string().optional(),
  'filter.skill': z.string().optional(),
});

export const Route = createFileRoute('/_authed/planner/plans_/$planId')({
  validateSearch: searchSchema,
  component: PlanRoute,
});

function PlanRoute() {
  const { planId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const filters = parseFiltersFromSearch(search as Record<string, string | undefined>);
  const view = parseViewMode(search.view);
  const groupBy = parseGroupBy(search.groupBy);

  const onFiltersChange = (f: typeof filters) =>
    navigate({ search: (prev) => ({ ...prev, ...serializeFiltersToSearch(f) }) });
  const onViewChange = (v: 'board' | 'grid') =>
    navigate({ search: (prev) => ({ ...prev, view: v === 'board' ? undefined : v }) });
  const onOpenTask = (taskId: string) =>
    navigate({ search: (prev) => ({ ...prev, task: taskId }) });

  return (
    <>
      {view === 'board' ? (
        <PlanPage
          planId={planId}
          view={view}
          filters={filters}
          onFiltersChange={onFiltersChange}
          onViewChange={onViewChange}
          onOpenTask={onOpenTask}
        />
      ) : (
        <PlanGridPage
          planId={planId}
          view={view}
          filters={filters}
          onFiltersChange={onFiltersChange}
          onViewChange={onViewChange}
          onOpenTask={onOpenTask}
          groupBy={groupBy}
          onGroupByChange={(g) =>
            navigate({ search: (prev) => ({ ...prev, groupBy: g === 'bucket' ? undefined : g }) })
          }
        />
      )}
      {search.task && (
        <TaskSheetContainer
          taskId={search.task}
          planId={planId}
          onClose={() => navigate({ search: (prev) => ({ ...prev, task: undefined }) })}
        />
      )}
    </>
  );
}
