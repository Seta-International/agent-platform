import {
  BreadcrumbItem,
  Breadcrumbs,
  DisabledActionTooltip,
  DropdownMenu,
  DropdownMenuItem,
  formatRelative,
  Skeleton,
  useToast,
} from '@seta/shared-ui';
import { useAgentContext } from '@seta/web-agent';
import { usePermission, useSession } from '@seta/web-identity';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRightLeft, Copy, MoreHorizontal } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { PlannerClientError } from '../api/planner-client';
import { ConfirmDeleteTaskDialog } from '../components/ConfirmDeleteTaskDialog';
import { DuplicateTaskDialog } from '../components/DuplicateTaskDialog';
import { MoveTaskDialog } from '../components/MoveTaskDialog';
import { PlanError } from '../components/plan-error';
import { TaskDetailAssigneesCard } from '../components/TaskDetailAssigneesCard';
import { TaskDetailChecklistCard } from '../components/TaskDetailChecklistCard';
import { TaskDetailCommentsCard } from '../components/TaskDetailCommentsCard';
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
import { PERMISSION_DENIED } from '../lib/permission-messages';
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
  /**
   * Modal variant only: closes the dialog, revealing the board underneath. The plan
   * breadcrumb uses this instead of a router navigation — the board is already mounted
   * behind the dialog, so closing preserves its scroll/selection state.
   */
  onClose?: () => void;
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
  onClose,
}: Props) {
  const navigate = useNavigate();
  const toast = useToast();
  const session = useSession();
  const currentUserId = session.user_id;
  const taskQ = useTaskDetail(taskId);
  const boardQ = usePlanBoard(planId);
  const deleteTask = useDeleteTask(planId);
  const duplicateTask = useDuplicateTask(planId);
  const moveTask = useMoveTask(planId);
  const canCreate = usePermission('planner.task.create');
  const canUpdate = usePermission('planner.task.update');
  const canDelete = usePermission('planner.task.delete');
  const duplicateDisabledReason = canCreate ? undefined : PERMISSION_DENIED.task.create;
  const moveDisabledReason = canUpdate ? undefined : PERMISSION_DENIED.task.edit;
  const deleteDisabledReason = canDelete ? undefined : PERMISSION_DENIED.task.delete;
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);

  const openFromMenu = (open: () => void) => () => requestAnimationFrame(open);

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
    toast({ body: "You don't have access to this task anymore.", type: 'error' });
    void navigate({ to: '/planner/groups' });
  }, [isForbidden, navigate, toast]);

  useAgentContext({
    kind: 'planner.task',
    id: taskId,
    label: taskQ.data?.title ?? 'Task',
    summary: taskQ.data?.description?.slice(0, 200),
  });

  if (taskQ.isPending) {
    return (
      <div role="status" aria-label="Loading task" className="p-7">
        <Skeleton className="mb-4" height={32} width="33.3333%" />
        <Skeleton className="mb-2" height={16} width="50%" />
        <Skeleton height={256} />
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
    membersQ.data?.members.find((m) => m.user_id === task.created_by)?.display_name ?? 'Unknown';
  const isGroupOwner =
    membersQ.data?.members.some((m) => m.user_id === currentUserId && m.role === 'owner') ?? false;

  const goToTask = (id: string) =>
    void navigate({
      to: '/planner/plans/$planId/tasks/$taskId',
      params: { planId, taskId: id },
    });

  function handleConfirmDelete() {
    if (!canDelete) return;
    deleteTask.mutate(
      { task_id: taskId, expected_version: task.version },
      {
        onSuccess: () => {
          setDeleteOpen(false);
          toast({ body: 'Task moved to Trash.' });
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
    if (!canUpdate) return;
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
          toast({ body: `Task moved to ${args.targetPlanName}.` });
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
    if (!canCreate) return;
    duplicateTask.mutate(
      { task_id: taskId, options },
      {
        onSuccess: (created) => {
          setDuplicateOpen(false);
          toast({ body: 'Task duplicated.' });
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
    <div className={`flex flex-col ${variant === 'modal' ? 'min-h-0 flex-1' : 'h-full'}`}>
      {variant === 'page' && (
        <TaskDetailHeader
          taskNumber={taskNumberFromId(task.id)}
          groupId={groupId}
          groupName={groupQ.data?.name ?? ''}
          planId={planId}
          planName={plan?.name ?? ''}
          bucketName={bucketName}
          titleSlot={<TaskTitleEditor task={task} planId={planId} />}
          onBack={() => void navigate({ to: '/planner/plans/$planId', params: { planId } })}
          onAskAgent={() => toast({ body: 'Agent is coming soon.' })}
          onCopyLink={() => {
            void navigator.clipboard.writeText(window.location.href);
            toast({ body: 'Link copied.' });
          }}
          onPrevious={() => prevTaskId && goToTask(prevTaskId)}
          onNext={() => nextTaskId && goToTask(nextTaskId)}
          onDuplicate={openFromMenu(() => setDuplicateOpen(true))}
          onMove={openFromMenu(() => setMoveOpen(true))}
          onDelete={openFromMenu(() => setDeleteOpen(true))}
          duplicateDisabledReason={duplicateDisabledReason}
          moveDisabledReason={moveDisabledReason}
          deleteDisabledReason={deleteDisabledReason}
        />
      )}
      {variant === 'modal' && (
        <header className="flex flex-col gap-2 border-b border-border bg-body px-5 pt-2.5 pb-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Breadcrumbs variant="supporting">
                {groupId ? (
                  <BreadcrumbItem href={`/planner/groups/${groupId}`}>
                    {groupQ.data?.name ?? ''}
                  </BreadcrumbItem>
                ) : (
                  <BreadcrumbItem>{groupQ.data?.name ?? ''}</BreadcrumbItem>
                )}
                {/* Keeps a real href so the crumb is a genuine link; a modified click
                    (cmd/ctrl/shift) falls through to real navigation, while a plain click closes
                    the dialog in place — the board is already mounted behind it, so no navigation
                    is needed to "go back" to it. */}
                <BreadcrumbItem
                  href={`/planner/plans/${planId}`}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                    e.preventDefault();
                    onClose?.();
                  }}
                >
                  {plan?.name ?? ''}
                </BreadcrumbItem>
                <BreadcrumbItem isCurrent>{`T-${taskNumberFromId(task.id)}`}</BreadcrumbItem>
              </Breadcrumbs>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <DropdownMenu
                placement="below"
                button={{
                  isIconOnly: true,
                  icon: <MoreHorizontal className="size-4" />,
                  variant: 'ghost',
                  size: 'sm',
                  label: 'More actions',
                }}
              >
                <DisabledActionTooltip
                  disabled={Boolean(duplicateDisabledReason)}
                  reason={duplicateDisabledReason}
                >
                  <DropdownMenuItem
                    icon={<Copy className="size-3.5" />}
                    label="Duplicate"
                    onClick={openFromMenu(() => setDuplicateOpen(true))}
                    isDisabled={Boolean(duplicateDisabledReason)}
                  />
                </DisabledActionTooltip>
                <DisabledActionTooltip
                  disabled={Boolean(moveDisabledReason)}
                  reason={moveDisabledReason}
                >
                  <DropdownMenuItem
                    icon={<ArrowRightLeft className="size-3.5" />}
                    label="Move…"
                    onClick={openFromMenu(() => setMoveOpen(true))}
                    isDisabled={Boolean(moveDisabledReason)}
                  />
                </DisabledActionTooltip>
                <DisabledActionTooltip
                  disabled={Boolean(deleteDisabledReason)}
                  reason={deleteDisabledReason}
                >
                  <DropdownMenuItem
                    label="Delete"
                    style={{ color: 'var(--color-error)' }}
                    onClick={openFromMenu(() => setDeleteOpen(true))}
                    isDisabled={Boolean(deleteDisabledReason)}
                  />
                </DisabledActionTooltip>
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
      <div className="min-h-0 flex-1 overflow-auto bg-card">
        <div
          className="mx-auto grid grid-cols-[minmax(640px,1fr)_320px] gap-[22px] px-7 pt-5 pb-10"
          style={{ maxWidth: 1180 }}
        >
          <main className="flex min-w-0 flex-col gap-4">
            <TaskDetailDescriptionCard task={task} planId={planId} />
            <TaskDetailReferencesCard task={task} planId={planId} />
            <TaskDetailChecklistCard task={task} planId={planId} />
            <TaskDetailCommentsCard
              taskId={task.id}
              currentUserId={currentUserId}
              isGroupOwner={isGroupOwner}
            />
          </main>
          <aside
            className="sticky top-5 flex flex-col gap-3.5 self-start pr-1"
            aria-label="Task properties"
          >
            <TaskDetailProgressCard task={task} planId={planId} />
            <TaskDetailAssigneesCard
              task={task}
              planId={planId}
              groupId={groupId ?? ''}
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
              className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm text-secondary"
              aria-label="Task metadata"
            >
              <dt className="text-disabled">Created</dt>
              <dd>
                <time dateTime={task.created_at} title={task.created_at}>
                  {formatAbsoluteDate(task.created_at)}
                </time>
                {' · '}
                <span className="text-disabled">{formatRelative(task.created_at)}</span>
                <br />
                by <span className="text-secondary">{creatorName}</span>
              </dd>
              <dt className="text-disabled">Updated</dt>
              <dd>
                <time dateTime={task.updated_at} title={task.updated_at}>
                  {formatAbsoluteDate(task.updated_at)}
                </time>
                {' · '}
                <span className="text-disabled">{formatRelative(task.updated_at)}</span>
              </dd>
            </dl>
          </aside>
        </div>
      </div>
    </div>
  );
}
