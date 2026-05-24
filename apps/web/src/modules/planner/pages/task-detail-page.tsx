import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  formatRelative,
  Skeleton,
  toast,
} from '@seta/shared-ui';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRightLeft, ChevronRight, Copy, MoreHorizontal } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useCopilotContext } from '@/modules/copilot';
import { PlannerClientError } from '../api/planner-client';
import { ConfirmDeleteTaskDialog } from '../components/ConfirmDeleteTaskDialog';
import { DuplicateTaskDialog } from '../components/DuplicateTaskDialog';
import { MoveTaskDialog } from '../components/MoveTaskDialog';
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
import { type DuplicateOptions, useDuplicateTask } from '../hooks/mutations/duplicate-task';
import { useMoveTask } from '../hooks/mutations/move-task';
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

const ABSOLUTE_DATE_FMT = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatAbsoluteDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : ABSOLUTE_DATE_FMT.format(d);
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
  const duplicateTask = useDuplicateTask(planId);
  const moveTask = useMoveTask(planId);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);

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

  useCopilotContext({
    kind: 'planner.task',
    id: taskId,
    label: taskQ.data?.title ?? 'Task',
    summary: taskQ.data?.description?.slice(0, 200),
  });

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

  function handleConfirmMove(args: {
    targetPlanId: string;
    targetBucketId: string | null;
    targetPlanName: string;
  }) {
    moveTask.mutate(
      {
        task_id: taskId,
        expected_version: task.version,
        new_plan_id: args.targetPlanId,
        bucket_id: args.targetBucketId,
      },
      {
        onSuccess: () => {
          setMoveOpen(false);
          toast(`Task moved to ${args.targetPlanName}.`);
          if (variant === 'modal') {
            // Modal: close the dialog and bring the user to the target board
            // with the task pre-selected so context is preserved.
            void navigate({
              to: '/planner/plans/$planId',
              params: { planId: args.targetPlanId },
              search: (prev: Record<string, unknown>) => ({ ...prev, selectedTask: taskId }),
            });
          } else {
            // Page: navigate to the moved task on its new plan.
            void navigate({
              to: '/planner/plans/$planId/tasks/$taskId',
              params: { planId: args.targetPlanId, taskId },
            });
          }
        },
      },
    );
  }

  function handleConfirmDuplicate(options: DuplicateOptions) {
    duplicateTask.mutate(
      { task_id: taskId, options },
      {
        onSuccess: (created) => {
          setDuplicateOpen(false);
          toast('Task duplicated.');
          if (variant === 'modal') {
            // Modal variant lives under a route that opens the dialog via the
            // `selectedTask` search param; swap it to the new task so the user
            // stays in-context on the board.
            void navigate({
              to: '/planner/plans/$planId',
              params: { planId },
              search: (prev: Record<string, unknown>) => ({ ...prev, selectedTask: created.id }),
            });
          } else {
            void navigate({
              to: '/planner/plans/$planId/tasks/$taskId',
              params: { planId, taskId: created.id },
            });
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
          groupName={groupQ.data?.name ?? ''}
          planName={plan?.name ?? ''}
          bucketName={bucketName}
          titleSlot={<TaskTitleEditor task={task} planId={planId} />}
          onBack={() => void navigate({ to: '/planner/plans/$planId', params: { planId } })}
          onAskCopilot={() => toast('Copilot is coming soon.')}
          onCopyLink={() => {
            void navigator.clipboard.writeText(window.location.href);
            toast('Link copied.');
          }}
          onPrevious={() => prevTaskId && goToTask(prevTaskId)}
          onNext={() => nextTaskId && goToTask(nextTaskId)}
          onDuplicate={() => setDuplicateOpen(true)}
          onMove={() => setMoveOpen(true)}
          onDelete={() => setDeleteOpen(true)}
        />
      )}
      {variant === 'modal' && (
        <header className="flex flex-col gap-2 border-b border-hairline bg-canvas px-5 pt-2.5 pb-3">
          <div className="flex items-center justify-between gap-3">
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
                  <DropdownMenuItem onSelect={() => setDuplicateOpen(true)}>
                    <Copy className="size-3.5" />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setMoveOpen(true)}>
                    <ArrowRightLeft className="size-3.5" />
                    Move…
                  </DropdownMenuItem>
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
          </div>
          <TaskTitleEditor task={task} planId={planId} />
        </header>
      )}
      <ConfirmDeleteTaskDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        taskTitle={task.title}
        onConfirm={handleConfirmDelete}
        pending={deleteTask.isPending}
      />
      <DuplicateTaskDialog
        open={duplicateOpen}
        onOpenChange={setDuplicateOpen}
        taskTitle={task.title}
        onConfirm={handleConfirmDuplicate}
        pending={duplicateTask.isPending}
      />
      <MoveTaskDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        taskTitle={task.title}
        currentPlanId={planId}
        hasLabels={task.labels.length > 0}
        onConfirm={handleConfirmMove}
        pending={moveTask.isPending}
      />
      <div className="min-h-0 flex-1 overflow-y-auto bg-surface-1">
        <div
          className="mx-auto grid grid-cols-[minmax(0,1fr)_320px] gap-[22px] px-7 pt-5 pb-10"
          style={{ maxWidth: 1180 }}
        >
          <main className="flex min-w-0 flex-col gap-4">
            <TaskDetailDescriptionCard task={task} planId={planId} />
            <TaskDetailReferencesCard task={task} planId={planId} />
            <TaskDetailChecklistCard task={task} planId={planId} />
          </main>
          <aside className="flex flex-col gap-3.5 self-start pr-1" aria-label="Task properties">
            <TaskDetailProgressCard task={task} planId={planId} />
            <TaskDetailAssigneesCard
              task={task}
              planId={planId}
              isLinkedToM365={plan?.external_source === 'm365'}
            />
            <TaskDetailPriorityCard task={task} planId={planId} />
            <TaskDetailScheduleCard task={task} planId={planId} />
            <TaskDetailLabelsCard
              task={task}
              planId={planId}
              isLinkedToM365={plan?.external_source === 'm365'}
            />
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
            <dl
              className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-caption text-ink-subtle"
              aria-label="Task metadata"
            >
              <dt className="text-ink-tertiary">Created</dt>
              <dd>
                <time dateTime={task.created_at} title={task.created_at}>
                  {formatAbsoluteDate(task.created_at)}
                </time>
                {' · '}
                <span className="text-ink-tertiary">{formatRelative(task.created_at)}</span>
                <br />
                by <span className="text-ink-muted">{creatorName}</span>
              </dd>
              <dt className="text-ink-tertiary">Updated</dt>
              <dd>
                <time dateTime={task.updated_at} title={task.updated_at}>
                  {formatAbsoluteDate(task.updated_at)}
                </time>
                {' · '}
                <span className="text-ink-tertiary">{formatRelative(task.updated_at)}</span>
              </dd>
            </dl>
          </aside>
        </div>
      </div>
    </div>
  );
}
