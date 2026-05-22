import {
  EmptyState,
  PLANNER_403_LIMIT_MESSAGES,
  type PlanConflictDecision,
  ResolvePlanConflictsDialog,
  TaskGrid,
  type TaskGridRow,
} from '@seta/shared-ui';
import { useMemo, useState } from 'react';
import { GridSkeleton } from '../components/board-skeleton';
import { GridBulkActionFooter } from '../components/grid-bulk-action-footer';
import { GridGroupBySelector } from '../components/grid-group-by-selector';
import { PlanError } from '../components/plan-error';
import { PlanFilterBar } from '../components/plan-filter-bar';
import { PlanPageHeader } from '../components/plan-page-header';
import { PlanSearchInput } from '../components/plan-search-input';
import { PlanViewSwitcher } from '../components/plan-view-switcher';
import { useCompleteTask } from '../hooks/mutations/complete-task';
import { useMoveTask } from '../hooks/mutations/move-task';
import { useRefreshPlanSync } from '../hooks/mutations/refresh-plan-sync';
import { useReopenTask } from '../hooks/mutations/reopen-task';
import {
  type ResolvePlanDecisions,
  useResolvePlanConflicts,
} from '../hooks/mutations/resolve-plan-conflicts';
import { useUpdateTask } from '../hooks/mutations/update-task';
import { usePlanBoard } from '../hooks/queries/use-plan-board';
import { useBulkActions } from '../hooks/use-bulk-actions';
import { useFilterOptions } from '../hooks/use-filter-options';
import { useGridColumnPrefs } from '../hooks/use-grid-column-prefs';
import { useSelectedTaskIds } from '../state/selected-task-ids';
import {
  type PriorityLabel,
  priorityLabel,
  priorityNumber,
  progressLabel,
} from '../state/task-derived';
import type { BoardFilters, GroupBy } from '../state/url-state';

interface Props {
  planId: string;
  filters: BoardFilters;
  onFiltersChange: (f: BoardFilters) => void;
  onOpenTask: (taskId: string) => void;
  view: 'board' | 'grid';
  onViewChange: (v: 'board' | 'grid') => void;
  groupBy: GroupBy;
  onGroupByChange: (g: GroupBy) => void;
  q?: string;
  onQChange?: (next: string) => void;
  currentUserId?: string;
  groupName?: string;
  canManage?: boolean;
  onRenamePlan?: (name: string) => void;
  onArchivePlan?: () => void;
  onDeletePlan?: () => void;
}

export function PlanGridPage({
  planId,
  filters,
  onFiltersChange,
  onOpenTask,
  onViewChange,
  view,
  groupBy,
  onGroupByChange,
  q = '',
  onQChange,
  currentUserId,
  groupName,
  canManage,
  onRenamePlan,
  onArchivePlan,
  onDeletePlan,
}: Props) {
  const boardQ = usePlanBoard(planId);
  const filterOptions = useFilterOptions(boardQ.data);
  const selectedIds = useSelectedTaskIds((s) => s.ids);
  const setSelectedIds = useSelectedTaskIds((s) => s.set);
  const clearSelection = useSelectedTaskIds((s) => s.clear);
  const [prefs, setPrefs] = useGridColumnPrefs(planId);
  const updateTask = useUpdateTask(planId);
  const moveTask = useMoveTask(planId);
  const completeTask = useCompleteTask(planId);
  const reopenTask = useReopenTask(planId);
  const refreshSync = useRefreshPlanSync(planId);
  const resolveConflicts = useResolvePlanConflicts(planId);
  const bulk = useBulkActions(planId);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);

  const { rows, tasksById, bucketOptions, assigneeOptions } = useMemo(() => {
    if (!boardQ.data) {
      return { rows: [], tasksById: new Map(), bucketOptions: [], assigneeOptions: [] };
    }

    const { tasks, buckets } = boardQ.data;
    const bucketById = new Map(buckets.map((b) => [b.id, b]));
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    const gridRows: TaskGridRow[] = tasks.flatMap((t) => {
      if (
        filters.assignee_ids.length &&
        !t.assignees.some((a) => filters.assignee_ids.includes(a.user_id))
      ) {
        return [];
      }
      if (filters.label_ids.length && !t.labels.some((l) => filters.label_ids.includes(l.id))) {
        return [];
      }
      if (filters.skill_tags.length && !t.skill_tags.some((s) => filters.skill_tags.includes(s))) {
        return [];
      }
      if (q && !t.title.toLowerCase().includes(q.toLowerCase())) {
        return [];
      }
      return [
        {
          id: t.id,
          title: t.title,
          status: progressLabel({
            percent_complete: t.percent_complete,
            is_deferred: t.is_deferred,
          }),
          bucket: bucketById.get(t.bucket_id ?? '')?.name ?? 'No bucket',
          bucket_id: t.bucket_id,
          priority: priorityLabel(t.priority_number),
          assignees: t.assignees.map((a) => ({ id: a.user_id, name: a.display_name })),
          due: t.due_at,
          labels: t.labels.map((l) => ({ id: l.id, name: l.name })),
          external_source: t.external_source,
          sync_status: t.sync_status,
          external_synced_at: t.external_synced_at,
        },
      ];
    });

    const bucketOpts = buckets.map((b) => ({ id: b.id, name: b.name }));
    const assigneeMap = new Map<string, string>();
    for (const t of tasks) {
      for (const a of t.assignees) {
        if (!assigneeMap.has(a.user_id)) assigneeMap.set(a.user_id, a.display_name);
      }
    }
    const assigneeOpts = [...assigneeMap.entries()]
      .map(([user_id, display_name]) => ({ user_id, display_name }))
      .sort((a, b) => a.display_name.localeCompare(b.display_name));

    return {
      rows: gridRows,
      tasksById: taskMap,
      bucketOptions: bucketOpts,
      assigneeOptions: assigneeOpts,
    };
  }, [boardQ.data, filters, q]);

  if (boardQ.isPending) {
    return <GridSkeleton />;
  }
  if (boardQ.isError || !boardQ.data) {
    return <PlanError onRetry={() => boardQ.refetch()} />;
  }
  const { plan, buckets, tasks } = boardQ.data;

  function onCommitField(taskId: string, patch: Partial<TaskGridRow>) {
    const task = tasksById.get(taskId);
    if (!task) return;
    const expected_version = task.version;

    if (patch.bucket_id !== undefined) {
      moveTask.mutate({ task_id: taskId, expected_version, bucket_id: patch.bucket_id });
      return;
    }
    const currentStatus = progressLabel({
      percent_complete: task.percent_complete,
      is_deferred: task.is_deferred,
    });
    if (patch.status !== undefined) {
      if (patch.status === 'completed' && currentStatus !== 'completed') {
        completeTask.mutate({ task_id: taskId, expected_version });
      } else if (patch.status !== 'completed' && currentStatus === 'completed') {
        reopenTask.mutate({ task_id: taskId, expected_version });
      }
      return;
    }
    const apiPatch: Partial<{
      title: string;
      priority_number: 1 | 3 | 5 | 9;
      due_at: string | undefined;
    }> = {};
    if (patch.title !== undefined) apiPatch.title = patch.title;
    if (patch.priority !== undefined) {
      apiPatch.priority_number = priorityNumber(patch.priority as PriorityLabel);
    }
    if (patch.due !== undefined) apiPatch.due_at = patch.due ?? undefined;
    if (Object.keys(apiPatch).length === 0) return;
    updateTask.mutate({ task_id: taskId, expected_version, patch: apiPatch });
  }

  function selectedExpectedVersions() {
    return [...selectedIds].flatMap((id) => {
      const t = tasksById.get(id);
      return t !== undefined ? [{ id: t.id, expected_version: t.version }] : [];
    });
  }

  function onMove(toBucketId: string | null) {
    void bulk.bulkMove({ tasks: selectedExpectedVersions(), to_bucket_id: toBucketId });
    clearSelection();
  }
  function onAssign(userId: string) {
    void bulk.bulkAssign({ tasks: [...selectedIds], user_id: userId });
    clearSelection();
  }
  function onSetDue(due: string | null) {
    void bulk.bulkSetDue({ tasks: selectedExpectedVersions(), due_at: due });
    clearSelection();
  }
  function onDelete() {
    void bulk.bulkDelete({ tasks: selectedExpectedVersions() });
    clearSelection();
  }

  return (
    <div className="plan-grid-page">
      <PlanPageHeader
        planName={plan.name}
        groupName={groupName}
        groupId={plan.group_id}
        bucketCount={buckets.length}
        taskCount={tasks.length}
        myTaskCount={
          currentUserId
            ? tasks.filter((t) => t.assignees.some((a) => a.user_id === currentUserId)).length
            : undefined
        }
        canRename={canManage}
        canManage={canManage}
        onRename={onRenamePlan}
        onArchive={canManage ? onArchivePlan : undefined}
        onDelete={canManage ? onDeletePlan : undefined}
        external_source={plan.external_source}
        syncStatus={plan.sync_status}
        externalSyncedAt={plan.external_synced_at}
        externalId={plan.external_id}
        conflictCount={null}
        onRefreshSync={plan.external_source === 'm365' ? () => refreshSync.mutate() : undefined}
        onOpenConflictDialog={
          plan.external_source === 'm365' ? () => setConflictDialogOpen(true) : undefined
        }
      />
      <div className="plan-toolbar">
        <div className="plan-toolbar__left">
          <PlanFilterBar
            filters={filters}
            onChange={onFiltersChange}
            assigneeOptions={filterOptions.assigneeOptions}
            labelOptions={filterOptions.labelOptions}
            skillOptions={filterOptions.skillOptions}
          />
          <div className="plan-toolbar__divider" aria-hidden="true" />
          <PlanViewSwitcher value={view} onChange={onViewChange} />
          <GridGroupBySelector value={groupBy} onChange={onGroupByChange} />
        </div>
        <div className="plan-toolbar__right">
          {onQChange && <PlanSearchInput value={q} onChange={onQChange} />}
        </div>
      </div>
      {plan.sync_status === 'error' && plan.last_error && (
        <div
          role="alert"
          className="mx-7 mt-3 rounded border border-semantic-danger bg-semantic-danger-tint p-3 text-body-sm"
          data-testid="plan-sync-error-banner"
        >
          <div className="font-medium">
            Sync failed: {PLANNER_403_LIMIT_MESSAGES[plan.last_error] ?? plan.last_error}
          </div>
          <button
            type="button"
            className="mt-2 text-primary underline"
            onClick={() => refreshSync.mutate()}
            disabled={refreshSync.isPending}
          >
            Retry sync
          </button>
        </div>
      )}
      {plan.sync_status === 'conflict' && (
        <div
          className="mx-7 mt-3 rounded border border-semantic-warning bg-semantic-warning-tint p-3 text-body-sm"
          data-testid="plan-sync-conflict-banner"
        >
          <div className="font-medium">Sync conflicts need resolution</div>
          <button
            type="button"
            className="mt-2 text-primary underline"
            onClick={() => setConflictDialogOpen(true)}
          >
            Resolve now
          </button>
        </div>
      )}
      {plan.sync_status === 'pulling' && tasks.length === 0 ? (
        <div role="status" data-testid="plan-sync-pulling-empty">
          <EmptyState
            title="Syncing from M365 Planner…"
            description="This may take a minute for large plans."
          />
        </div>
      ) : (
        <>
          <TaskGrid
            rows={rows}
            groupBy={groupBy}
            selection={selectedIds}
            onSelectionChange={setSelectedIds}
            onCommitField={onCommitField}
            bucketOptions={bucketOptions}
            onOpenTask={onOpenTask}
            columnOrder={prefs.order}
            columnWidths={prefs.widths}
            onColumnOrderChange={(order) => setPrefs((p) => ({ ...p, order }))}
            onColumnWidthsChange={(widths) => setPrefs((p) => ({ ...p, widths }))}
          />
          {selectedIds.size > 0 && (
            <GridBulkActionFooter
              count={selectedIds.size}
              bucketOptions={bucketOptions}
              assigneeOptions={assigneeOptions}
              onMove={onMove}
              onAssign={onAssign}
              onSetDue={onSetDue}
              onDelete={onDelete}
            />
          )}
        </>
      )}
      {plan.external_source === 'm365' && (
        <ResolvePlanConflictsDialog
          open={conflictDialogOpen}
          onOpenChange={setConflictDialogOpen}
          data={{ planId: plan.id, planLevelConflicts: [], taskConflicts: [] }}
          onApply={async (decisions: PlanConflictDecision[]) => {
            const apiDecisions: ResolvePlanDecisions = decisions.map((d) =>
              d.kind === 'plan'
                ? { kind: 'plan', field: d.field, choice: d.choice }
                : { kind: 'task', task_id: d.taskId, field: d.field, choice: d.choice },
            );
            await resolveConflicts.mutateAsync(apiDecisions);
            setConflictDialogOpen(false);
          }}
        />
      )}
    </div>
  );
}
