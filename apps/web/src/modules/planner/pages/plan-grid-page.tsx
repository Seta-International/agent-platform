import { TaskGrid, type TaskGridRow } from '@seta/shared-ui';
import { useMemo } from 'react';
import { GridBulkActionFooter } from '../components/grid-bulk-action-footer';
import { GridGroupBySelector } from '../components/grid-group-by-selector';
import { PlanFilterBar } from '../components/plan-filter-bar';
import { PlanViewSwitcher } from '../components/plan-view-switcher';
import { useUpdateTask } from '../hooks/mutations/update-task';
import { usePlanBoard } from '../hooks/queries/use-plan-board';
import { useBulkActions } from '../hooks/use-bulk-actions';
import { useGridColumnPrefs } from '../hooks/use-grid-column-prefs';
import { useSelectedTaskIds } from '../state/selected-task-ids';
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
}

export function PlanGridPage({
  planId,
  filters,
  onFiltersChange,
  onViewChange,
  view,
  groupBy,
  onGroupByChange,
}: Props) {
  const boardQ = usePlanBoard(planId);
  const selectedIds = useSelectedTaskIds((s) => s.ids);
  const setSelectedIds = useSelectedTaskIds((s) => s.set);
  const clearSelection = useSelectedTaskIds((s) => s.clear);
  const [prefs, setPrefs] = useGridColumnPrefs(planId);
  const updateTask = useUpdateTask(planId);
  const bulk = useBulkActions(planId);

  const { rows, tasksById } = useMemo(() => {
    if (!boardQ.data) return { rows: [], tasksById: new Map() };

    const { tasks, buckets } = boardQ.data;
    const bucketById = new Map(buckets.map((b) => [b.id, b]));
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    const gridRows: TaskGridRow[] = tasks
      .filter((t) => {
        if (
          filters.assignee_ids.length &&
          !t.assignees.some((a) => filters.assignee_ids.includes(a.user_id))
        ) {
          return false;
        }
        if (filters.label_ids.length && !t.labels.some((l) => filters.label_ids.includes(l.id))) {
          return false;
        }
        if (
          filters.skill_tags.length &&
          !t.skill_tags.some((s) => filters.skill_tags.includes(s))
        ) {
          return false;
        }
        return true;
      })
      .map((t) => ({
        id: t.id,
        title: t.title,
        status: t.progress,
        bucket: bucketById.get(t.bucket_id ?? '')?.name ?? 'No bucket',
        priority: t.priority,
        assignees: t.assignees.map((a) => ({ id: a.user_id, name: a.display_name })),
        due: t.due_at,
        labels: t.labels.map((l) => ({ id: l.id, name: l.name })),
      }));

    return { rows: gridRows, tasksById: taskMap };
  }, [boardQ.data, filters]);

  if (boardQ.isPending) {
    return <div data-testid="grid-skeleton">Loading…</div>;
  }
  if (boardQ.isError || !boardQ.data) {
    return <div role="alert">Couldn't load the plan.</div>;
  }

  function onCommitField(taskId: string, patch: Partial<TaskGridRow>) {
    if (patch.title === undefined) {
      // Only title is inline-editable in this slice; other field commits are a no-op.
      return;
    }
    const task = tasksById.get(taskId);
    if (!task) return;
    updateTask.mutate({
      task_id: taskId,
      expected_version: task.version,
      patch: { title: patch.title },
    });
  }

  function onMove(toBucketId: string | null) {
    const selectedTasks = [...selectedIds]
      .map((id) => tasksById.get(id))
      .filter((t): t is NonNullable<typeof t> => t !== undefined)
      .map((t) => ({ id: t.id, expected_version: t.version }));

    void bulk.bulkMove({ tasks: selectedTasks, to_bucket_id: toBucketId });
    clearSelection();
  }

  return (
    <div className="plan-grid-page">
      <div className="plan-toolbar">
        <PlanFilterBar filters={filters} onChange={onFiltersChange} />
        <GridGroupBySelector value={groupBy} onChange={onGroupByChange} />
        <PlanViewSwitcher value={view} onChange={onViewChange} />
      </div>
      <TaskGrid
        rows={rows}
        groupBy={groupBy}
        selection={selectedIds}
        onSelectionChange={setSelectedIds}
        onCommitField={onCommitField}
        columnOrder={prefs.order}
        columnWidths={prefs.widths}
        onColumnOrderChange={(order) => setPrefs((p) => ({ ...p, order }))}
        onColumnWidthsChange={(widths) => setPrefs((p) => ({ ...p, widths }))}
      />
      {selectedIds.size > 0 && (
        <GridBulkActionFooter
          count={selectedIds.size}
          onMove={onMove}
          onAssign={() => {}}
          onSetDue={() => {}}
          onDelete={() => {}}
        />
      )}
    </div>
  );
}
