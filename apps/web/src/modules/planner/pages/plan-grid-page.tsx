import { TaskGrid, type TaskGridRow } from '@seta/shared-ui';
import { useMemo } from 'react';
import { GridSkeleton } from '../components/board-skeleton';
import { GridBulkActionFooter } from '../components/grid-bulk-action-footer';
import { GridGroupBySelector } from '../components/grid-group-by-selector';
import { PlanError } from '../components/plan-error';
import { PlanFilterBar } from '../components/plan-filter-bar';
import { PlanSearchInput } from '../components/plan-search-input';
import { PlanViewSwitcher } from '../components/plan-view-switcher';
import { useCompleteTask } from '../hooks/mutations/complete-task';
import { useMoveTask } from '../hooks/mutations/move-task';
import { useReopenTask } from '../hooks/mutations/reopen-task';
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
  const bulk = useBulkActions(planId);

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
      <div className="plan-toolbar">
        <PlanFilterBar
          filters={filters}
          onChange={onFiltersChange}
          assigneeOptions={filterOptions.assigneeOptions}
          labelOptions={filterOptions.labelOptions}
          skillOptions={filterOptions.skillOptions}
        />
        <GridGroupBySelector value={groupBy} onChange={onGroupByChange} />
        <div className="plan-toolbar__right">
          {onQChange && <PlanSearchInput value={q} onChange={onQChange} />}
          <PlanViewSwitcher value={view} onChange={onViewChange} />
        </div>
      </div>
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
    </div>
  );
}
