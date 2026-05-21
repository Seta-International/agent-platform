import { Skeleton, toast } from '@seta/shared-ui';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';
import { PlannerClientError } from '../api/planner-client';
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
import { useGroup } from '../hooks/queries/use-group';
import { useGroupMembers } from '../hooks/queries/use-group-members';
import { usePlanBoard } from '../hooks/queries/use-plan-board';
import { useTaskDetail } from '../hooks/queries/use-task-detail';
import { compareOrderHint } from '../state/task-derived';

interface Props {
  planId: string;
  taskId: string;
}

// Stable, monotonic-ish task number derived from the trailing UUID hex. The
// planner schema doesn't carry a human-readable task number; the T-XXXX badge
// in the header is purely a UI affordance, so a deterministic hash is enough.
function taskNumberFromId(id: string): number {
  const tail = id.replace(/-/g, '').slice(-4);
  const parsed = Number.parseInt(tail, 16);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function TaskDetailPage({ planId, taskId }: Props) {
  const navigate = useNavigate();
  const taskQ = useTaskDetail(taskId);
  const boardQ = usePlanBoard(planId);

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
    toast.error('You no longer have access to this task.');
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

  return (
    <div className="flex flex-col h-full">
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
        onAskCopilot={() => toast('Copilot integration coming soon.')}
        onCopyLink={() => {
          void navigator.clipboard.writeText(window.location.href);
          toast('Link copied to clipboard.');
        }}
        onPrevious={() => prevTaskId && goToTask(prevTaskId)}
        onNext={() => nextTaskId && goToTask(nextTaskId)}
      />
      <div className="flex-1 overflow-auto bg-surface-1">
        <div
          className="mx-auto"
          style={{
            maxWidth: 1180,
            padding: '20px 28px 40px',
            display: 'grid',
            gridTemplateColumns: '1fr 320px',
            gap: 22,
            alignItems: 'flex-start',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            <TaskDetailDescriptionCard task={task} planId={planId} />
            <TaskDetailReferencesCard task={task} planId={planId} />
            <TaskDetailChecklistCard task={task} planId={planId} />
          </div>
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <TaskDetailProgressCard task={task} planId={planId} />
            <TaskDetailPriorityCard task={task} planId={planId} />
            <TaskDetailScheduleCard task={task} planId={planId} />
            <TaskDetailPreviewTypeCard task={task} planId={planId} />
            <TaskDetailAssigneesCard task={task} planId={planId} />
            <TaskDetailLabelsCard task={task} planId={planId} />
            <TaskDetailExternalCard task={task} />
          </aside>
        </div>
      </div>
    </div>
  );
}
