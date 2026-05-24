import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Skeleton,
  toast,
} from '@seta/shared-ui';
import { useNavigate } from '@tanstack/react-router';
import { ChevronRight, MoreHorizontal } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { PlannerClientError } from '../api/planner-client';
import { ConfirmDeleteTaskDialog } from '../components/ConfirmDeleteTaskDialog';
import { PlanError } from '../components/plan-error';
import { TaskDetailAssigneesCard } from '../components/TaskDetailAssigneesCard';
import { TaskDetailChecklistCard } from '../components/TaskDetailChecklistCard';
import { TaskDetailDescriptionCard } from '../components/TaskDetailDescriptionCard';
import { TaskDetailExternalCard } from '../components/TaskDetailExternalCard';
import { TaskDetailHeader } from '../components/TaskDetailHeader';
import { TaskDetailLabelsCard } from '../components/TaskDetailLabelsCard';
import { TaskDetailPreviewTypeCard } from '../components/TaskDetailPreviewTypeCard';
import { TaskDetailPriorityCard } from '../components/TaskDetailPriorityCard';
import { TaskDetailProgressCard } from '../components/TaskDetailProgressCard';
import { TaskDetailReferencesCard } from '../components/TaskDetailReferencesCard';
import { TaskDetailScheduleCard } from '../components/TaskDetailScheduleCard';
import { TaskTitleEditor } from '../components/TaskTitleEditor';
import { useDeleteTask } from '../hooks/mutations/delete-task';
import { useGroup } from '../hooks/queries/use-group';
import { useGroupMembers } from '../hooks/queries/use-group-members';
import { usePlanBoard } from '../hooks/queries/use-plan-board';
import { useTaskDetail } from '../hooks/queries/use-task-detail';
import { compareOrderHint } from '../state/task-derived';

interface Props {
  planId: string;
  taskId: string;
  /** "modal" replaces the standalone-page sticky header with a compact modal header. */
  variant?: 'page' | 'modal';
  /** Action slot rendered into the modal header — typically the maximize/close buttons. */
  modalHeaderActions?: ReactNode;
  /**
   * Modal variant only: invoked after a successful task delete so the host
   * (e.g. `TaskDetailDialog`) can close the dialog and clear the URL state.
   * The full-page variant navigates back to the plan board itself.
   */
  onDeleted?: () => void;
}

// Stable, monotonic-ish task number derived from the trailing UUID hex. The
// planner schema doesn't carry a human-readable task number; the T-XXXX badge
// in the header is purely a UI affordance, so a deterministic hash is enough.
function taskNumberFromId(id: string): number {
  const tail = id.replace(/-/g, '').slice(-4);
  const parsed = Number.parseInt(tail, 16);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function TaskDetailPage({
  planId,
  taskId,
  variant = 'page',
  modalHeaderActions,
  onDeleted,
}: Props) {
  const navigate = useNavigate();
  const taskQ = useTaskDetail(taskId);
  const boardQ = usePlanBoard(planId);
  const deleteTask = useDeleteTask(planId);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const plan = boardQ.data?.plan;
  const groupId = plan?.group_id;
  const groupQ = useGroup(groupId ?? '');
  const membersQ = useGroupMembers(groupId ?? '');

  const orderedTaskIds = useMemo(() => {
    if (!boardQ.data) return [];
    return boardQ.data.tasks
      .slice()
      .sort((a, b) => compareOrderHint(a.order_hint, b.order_hint))
      .map((t) => t.id);
  }, [boardQ.data]);

  const { prevTaskId, nextTaskId } = useMemo(() => {
    const idx = orderedTaskIds.indexOf(taskId);
    if (idx === -1) return { prevTaskId: undefined, nextTaskId: undefined };
    return {
      prevTaskId: idx > 0 ? orderedTaskIds[idx - 1] : undefined,
      nextTaskId: idx < orderedTaskIds.length - 1 ? orderedTaskIds[idx + 1] : undefined,
    };
  }, [orderedTaskIds, taskId]);

  const taskErr = taskQ.error;
  const isForbidden = taskErr instanceof PlannerClientError && taskErr.status === 403;
  useEffect(() => {
    if (!isForbidden) return;
    toast.error("You don't have access to this task anymore.");
    void navigate({ to: '/planner/groups' });
  }, [isForbidden, navigate]);

  if (taskQ.isPending) {
    return (
      <div role="status" aria-label="Loading task" className="p-7">
        <Skeleton className="mb-4 h-8 w-1/3" />
        <Skeleton className="mb-2 h-4 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (isForbidden) return null;
  if (taskQ.isError || !taskQ.data) {
    return <PlanError error={taskQ.error} onRetry={() => void taskQ.refetch()} />;
  }

  const task = taskQ.data;
  const bucketName = boardQ.data?.buckets.find((b) => b.id === task.bucket_id)?.name ?? null;
  const creatorName =
    membersQ.data?.find((m) => m.user_id === task.created_by)?.display_name ?? 'Unknown';

  const goToTask = (id: string) =>
    void navigate({
      to: '/planner/plans/$planId/tasks/$taskId',
      params: { planId, taskId: id },
    });

  function handleConfirmDelete() {
    deleteTask.mutate(
      { task_id: taskId, expected_version: task.version },
      {
        onSuccess: () => {
          setDeleteOpen(false);
          toast.success('Task moved to Trash.');
          if (variant === 'modal') {
            onDeleted?.();
          } else {
            void navigate({ to: '/planner/plans/$planId', params: { planId } });
          }
        },
      },
    );
  }

  return (
    <div className="flex flex-col h-full">
      {variant === 'page' && (
        <TaskDetailHeader
          taskNumber={taskNumberFromId(task.id)}
          title={task.title}
          groupName={groupQ.data?.name ?? ''}
          planName={plan?.name ?? ''}
          bucketName={bucketName}
          createdAt={task.created_at}
          updatedAt={task.updated_at}
          creatorName={creatorName}
          onBack={() => void navigate({ to: '/planner/plans/$planId', params: { planId } })}
          onAskCopilot={() => toast('Copilot is coming soon.')}
          onCopyLink={() => {
            void navigator.clipboard.writeText(window.location.href);
            toast('Link copied.');
          }}
          onPrevious={() => prevTaskId && goToTask(prevTaskId)}
          onNext={() => nextTaskId && goToTask(nextTaskId)}
          onDelete={() => setDeleteOpen(true)}
        />
      )}
      {variant === 'modal' && (
        <header className="flex items-center justify-between gap-3 border-b border-hairline bg-canvas px-5 py-2.5">
          <div className="flex min-w-0 items-center gap-1.5 text-caption text-ink-subtle">
            <span className="truncate">{groupQ.data?.name ?? ''}</span>
            <ChevronRight className="size-3 shrink-0 text-ink-tertiary" aria-hidden />
            <span className="truncate text-primary">{plan?.name ?? ''}</span>
            <ChevronRight className="size-3 shrink-0 text-ink-tertiary" aria-hidden />
            <span className="mono inline-flex items-center rounded bg-surface-2 px-1.5 py-0.5 text-ink-muted">
              T-{taskNumberFromId(task.id)}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="More actions"
                  className="inline-flex size-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus"
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => setDeleteOpen(true)}
                  className="text-semantic-danger"
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {modalHeaderActions}
          </div>
        </header>
      )}
      <ConfirmDeleteTaskDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        taskTitle={task.title}
        onConfirm={handleConfirmDelete}
        pending={deleteTask.isPending}
      />
      <div className="min-h-0 flex-1 overflow-y-auto bg-surface-1">
        <div
          className="mx-auto grid grid-cols-[minmax(0,1fr)_320px] gap-[22px] px-7 pt-5 pb-10"
          style={{ maxWidth: 1180 }}
        >
          <main className="flex min-w-0 flex-col gap-4">
            <TaskTitleEditor task={task} planId={planId} />
            <TaskDetailDescriptionCard task={task} planId={planId} />
            <TaskDetailReferencesCard task={task} planId={planId} />
            <TaskDetailChecklistCard task={task} planId={planId} />
          </main>
          <aside
            className="sticky top-0 flex max-h-[80vh] flex-col gap-3.5 self-start overflow-y-auto pr-1"
            aria-label="Task properties"
          >
            <TaskDetailAssigneesCard
              task={task}
              planId={planId}
              isLinkedToM365={plan?.external_source === 'm365'}
            />
            <TaskDetailLabelsCard
              task={task}
              planId={planId}
              isLinkedToM365={plan?.external_source === 'm365'}
            />
            <TaskDetailScheduleCard task={task} planId={planId} />
            <TaskDetailPriorityCard task={task} planId={planId} />
            <TaskDetailProgressCard task={task} planId={planId} />
            <TaskDetailPreviewTypeCard task={task} planId={planId} />
            <TaskDetailExternalCard
              task={task}
              plan={
                plan
                  ? {
                      external_source: plan.external_source,
                      external_id: plan.external_id,
                      name: plan.name,
                    }
                  : undefined
              }
            />
          </aside>
        </div>
      </div>
    </div>
  );
}
