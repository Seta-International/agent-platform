import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { TaskDetailDialog } from '@/modules/planner/components/TaskDetailDialog';
import { PlanBoardShell } from '@/modules/planner/pages/plan-board-shell';
import { serializeFiltersToSearch } from '@/modules/planner/state/url-state';

const searchSchema = z.object({
  view: z.enum(['board', 'grid', 'calendar', 'charts']).optional(),
  groupBy: z.enum(['bucket', 'assignee', 'priority', 'due', 'label']).optional(),
  'filter.assignee': z.string().optional(),
  'filter.label': z.string().optional(),
  'filter.skill': z.string().optional(),
  q: z.string().optional(),
  /** Jira-style modal-over-board: when set, opens the task detail in a centered modal. */
  selectedTask: z.string().uuid().optional(),
  calFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  calTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  calPage: z.coerce.number().int().min(1).optional(),
  // Charts tab state (independent of board filters).
  'c.assignee': z.string().optional(),
  'c.bucket': z.string().optional(),
  'c.priority': z.string().optional(),
  'c.status': z.string().optional(),
  'c.from': z.string().optional(),
  'c.to': z.string().optional(),
  'c.show': z.string().optional(),
});

export const Route = createFileRoute('/_authed/planner/plans_/$planId')({
  validateSearch: searchSchema,
  component: PlanRoute,
});

function PlanRoute() {
  const { planId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const selectedTaskId = search.selectedTask;

  return (
    <>
      <PlanBoardShell
        planId={planId}
        search={search}
        onQChange={(next) =>
          navigate({ search: (prev) => ({ ...prev, q: next ? next : undefined }) })
        }
        onFiltersChange={(f) =>
          navigate({ search: (prev) => ({ ...prev, ...serializeFiltersToSearch(f) }) })
        }
        onViewChange={(v) =>
          navigate({ search: (prev) => ({ ...prev, view: v === 'board' ? undefined : v }) })
        }
        onGroupByChange={(g) =>
          navigate({ search: (prev) => ({ ...prev, groupBy: g === 'bucket' ? undefined : g }) })
        }
        onOpenTask={(taskId) => navigate({ search: (prev) => ({ ...prev, selectedTask: taskId }) })}
        onLeaveAfterDelete={(groupId) =>
          void navigate({ to: '/planner/groups/$groupId', params: { groupId } })
        }
        onCalendarRangeChange={(from, to, opts) =>
          navigate({
            replace: opts?.replace ?? false,
            search: (prev) => ({ ...prev, calFrom: from, calTo: to, calPage: undefined }),
          })
        }
        onCalendarPageChange={(page) =>
          navigate({
            search: (prev) => ({ ...prev, calPage: page <= 1 ? undefined : page }),
          })
        }
      />
      {selectedTaskId && (
        <TaskDetailDialog
          planId={planId}
          taskId={selectedTaskId}
          onClose={() => navigate({ search: (prev) => ({ ...prev, selectedTask: undefined }) })}
          onOpenFullPage={() =>
            void navigate({
              to: '/planner/plans/$planId/tasks/$taskId',
              params: { planId, taskId: selectedTaskId },
            })
          }
        />
      )}
    </>
  );
}
