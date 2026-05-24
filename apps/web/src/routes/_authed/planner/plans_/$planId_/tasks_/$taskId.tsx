import { createFileRoute } from '@tanstack/react-router';
import { plannerClient } from '@/modules/planner/api/planner-client';
import { TaskDetailPage } from '@/modules/planner/pages/task-detail-page';
import { plannerKeys } from '@/modules/planner/state/query-keys';

/**
 * Standalone full-page task detail (Jira's `/browse/ID`-equivalent). The modal-over-board
 * variant lives on the plan route as `?selectedTask=…`.
 */
export const Route = createFileRoute('/_authed/planner/plans_/$planId_/tasks_/$taskId')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData({
      queryKey: plannerKeys.task(params.taskId),
      queryFn: () => plannerClient.getTask(params.taskId),
    }),
  component: TaskDetailRoute,
});

function TaskDetailRoute() {
  const { planId, taskId } = Route.useParams();
  return <TaskDetailPage planId={planId} taskId={taskId} variant="page" />;
}
