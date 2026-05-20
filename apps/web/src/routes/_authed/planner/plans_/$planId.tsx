import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { PlanPage } from '@/modules/planner/pages/plan-page';
import { TaskSheetContainer } from '@/modules/planner/pages/task-sheet-container';
import {
  parseFiltersFromSearch,
  parseViewMode,
  serializeFiltersToSearch,
} from '@/modules/planner/state/url-state';

const searchSchema = z.object({
  view: z.enum(['board', 'grid']).optional(),
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

  return (
    <>
      <PlanPage
        planId={planId}
        view={view}
        filters={filters}
        onFiltersChange={(f) =>
          navigate({ search: (prev) => ({ ...prev, ...serializeFiltersToSearch(f) }) })
        }
        onViewChange={(v) =>
          navigate({ search: (prev) => ({ ...prev, view: v === 'board' ? undefined : v }) })
        }
        onOpenTask={(taskId) => navigate({ search: (prev) => ({ ...prev, task: taskId }) })}
      />
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
