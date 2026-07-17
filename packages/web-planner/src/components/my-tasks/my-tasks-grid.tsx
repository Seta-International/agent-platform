import type { MyTasksResult, TaskWithPlan } from '@seta/planner';
import {
  AvatarStack,
  Button,
  CounterBadgePopover,
  type DotTone,
  GroupedGrid,
  Popover,
  RadioGroup,
  RadioListItem,
  StatusToneDot,
  SyncBadge,
  type TableColumn,
  type TableSortState,
} from '@seta/shared-ui';
import { Link } from '@tanstack/react-router';
import { Layout } from 'lucide-react';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { deriveTaskStatus } from '../../lib/derive-task-status';
import { SECTION_SPECS } from '../../lib/my-tasks-sections';
import type { MyTasksRowTask } from './mt-task-row';
import { PriorityChip } from './priority-chip';
import { ProgressBar } from './progress-bar';
import type { SectionKey } from './types';

interface Props {
  data: MyTasksResult;
  /** Row click opens the task detail directly (same destination as the title link). */
  onOpenTask?: (task: MyTasksRowTask) => void;
}

type GridGroupBy = 'section' | 'plan' | 'priority' | 'status';

const GROUP_BY_OPTIONS: Array<{ value: GridGroupBy; label: string }> = [
  { value: 'section', label: 'Urgency (default)' },
  { value: 'plan', label: 'Plan' },
  { value: 'priority', label: 'Priority' },
  { value: 'status', label: 'Status' },
];

// Flattened row: original task + section tag + flat sort keys (the sortable
// plugin's default comparator reads `row[sortKey]` directly).
interface MtGridRow extends Record<string, unknown> {
  task: MyTasksRowTask;
  id: string;
  title: string;
  section: SectionKey;
  plan_name: string;
  priority_number: number;
  percent_complete: number;
  due_at: string | null;
  status_label: string;
}

function flatten(data: MyTasksResult): MtGridRow[] {
  const out: MtGridRow[] = [];
  for (const spec of SECTION_SPECS) {
    const tasks = data[spec.bucket] as ReadonlyArray<TaskWithPlan>;
    for (const t of tasks) {
      const task = t as MyTasksRowTask;
      out.push({
        task,
        id: task.id,
        title: task.title,
        section: spec.key,
        plan_name: task.plan.name,
        priority_number: task.priority_number,
        percent_complete: task.percent_complete,
        due_at: task.due_at ?? null,
        status_label: deriveTaskStatus(task),
      });
    }
  }
  return out;
}

const SECTION_BY_KEY = new Map(SECTION_SPECS.map((s) => [s.key as string, s]));

const STATUS_TONE: Record<string, DotTone> = {
  'Not started': 'muted',
  'In Progress': 'primary',
  Done: 'success',
  Deferred: 'warning',
};

function formatDueShort(v: string | null): ReactNode {
  if (!v) return <span className="text-disabled">—</span>;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return <span className="text-disabled">—</span>;
  return (
    <span className="text-secondary text-sm">
      {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
    </span>
  );
}

export function MyTasksGrid({ data, onOpenTask }: Props) {
  const rows = useMemo(() => flatten(data), [data]);
  const [groupBy, setGroupBy] = useState<GridGroupBy>('section');
  const [sort, setSort] = useState<TableSortState>([]);
  // Unlike the list view, every group starts expanded — the grid view has
  // always shown all tasks, and collapse is an opt-in interaction here.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());

  const groupKeyOf = useCallback(
    (r: MtGridRow): string => {
      switch (groupBy) {
        case 'section':
          return SECTION_BY_KEY.get(r.section)?.label ?? r.section;
        case 'plan':
          return r.plan_name;
        case 'priority':
          return PriorityChipLabel(r.priority_number);
        case 'status':
          return r.status_label;
      }
    },
    [groupBy],
  );

  const groupOrder = useMemo(() => {
    if (groupBy === 'section') return SECTION_SPECS.map((s) => s.label);
    if (groupBy === 'priority') return ['Urgent', 'Important', 'Medium', 'Low'];
    if (groupBy === 'status') return ['Not started', 'In Progress', 'Done', 'Deferred'];
    return undefined;
  }, [groupBy]);

  const renderGroupHeader = useCallback(
    (key: string, count: number) => {
      const tone: DotTone =
        groupBy === 'section'
          ? (SECTION_SPECS.find((s) => s.label === key)?.tone ?? 'muted')
          : groupBy === 'status'
            ? (STATUS_TONE[key] ?? 'muted')
            : 'muted';
      const hint =
        groupBy === 'section' ? SECTION_SPECS.find((s) => s.label === key)?.hint : undefined;
      return (
        <span className="flex items-center gap-2">
          <StatusToneDot tone={tone} label={key} />
          <span className="text-base font-semibold text-primary">{key}</span>
          <span className="text-sm text-secondary">{count}</span>
          {hint && <span className="text-xs text-disabled">· {hint}</span>}
        </span>
      );
    },
    [groupBy],
  );

  const columns = useMemo<TableColumn<MtGridRow>[]>(
    () => [
      {
        key: 'title',
        header: 'Task',
        width: { type: 'proportional', value: 2, minWidth: 220 },
        sortable: true,
        renderCell: (r) => (
          <span className="flex min-w-0 items-center gap-1.5">
            <Link
              to="/planner/plans/$planId/tasks/$taskId"
              params={{ planId: r.task.plan_id, taskId: r.id }}
              className="text-primary hover:text-accent no-underline font-medium truncate block"
            >
              {r.title}
            </Link>
            {r.task.external_source === 'm365' && (
              <SyncBadge
                state={r.task.sync_status ?? null}
                synced_at={r.task.external_synced_at ?? null}
                size="mini"
              />
            )}
          </span>
        ),
      },
      {
        key: 'plan_name',
        header: 'Plan',
        width: { type: 'proportional', value: 1, minWidth: 140 },
        sortable: true,
        renderCell: (r) => (
          <span className="inline-flex items-center gap-1.5 text-secondary text-sm truncate">
            <Layout size={11} className="text-accent shrink-0" />
            <span className="truncate">{r.plan_name}</span>
          </span>
        ),
      },
      {
        key: 'priority_number',
        header: 'Priority',
        width: { type: 'pixel', value: 120 },
        sortable: true,
        renderCell: (r) => <PriorityChip prio={r.task.priority_number} />,
      },
      {
        key: 'percent_complete',
        header: 'Progress',
        width: { type: 'pixel', value: 140 },
        sortable: true,
        renderCell: (r) => (
          <ProgressBar pct={r.task.percent_complete} status={deriveTaskStatus(r.task)} />
        ),
      },
      {
        key: 'due_at',
        header: 'Due',
        width: { type: 'pixel', value: 100 },
        sortable: true,
        renderCell: (r) => formatDueShort(r.due_at),
      },
      {
        key: 'labels',
        header: 'Labels',
        width: { type: 'pixel', value: 140 },
        renderCell: (r) => (
          <CounterBadgePopover items={r.task.labels} title="Labels" limit={2} type="label-chip" />
        ),
      },
      {
        key: 'assignees',
        header: 'Assignees',
        width: { type: 'pixel', value: 110 },
        renderCell: (r) => (
          <span className="flex">
            <AvatarStack assignees={r.task.assignees} max={2} />
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div data-testid="my-tasks-grid" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-end border-b border-border px-4 py-2">
        <Popover
          placement="below"
          alignment="end"
          width={260}
          label="View options"
          content={
            <RadioGroup
              label="Group by"
              value={groupBy}
              onChange={(v) => {
                setGroupBy(v as GridGroupBy);
                setCollapsedGroups(new Set());
              }}
            >
              {GROUP_BY_OPTIONS.map((opt) => (
                <RadioListItem key={opt.value} value={opt.value} label={opt.label} />
              ))}
            </RadioGroup>
          }
        >
          <Button label="View options" variant="secondary" size="sm" />
        </Popover>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <GroupedGrid<MtGridRow>
          rows={rows}
          columns={columns}
          getRowId={(r) => r.id}
          getRowLabel={(r) => r.title}
          groupBy={groupKeyOf}
          groupOrder={groupOrder}
          renderGroupHeader={renderGroupHeader}
          collapsedGroups={collapsedGroups}
          onToggleGroup={(key) =>
            setCollapsedGroups((prev) => {
              const next = new Set(prev);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              return next;
            })
          }
          onRowClick={onOpenTask ? (_id, r) => onOpenTask(r.task) : undefined}
          sort={sort}
          onSortChange={setSort}
        />
      </div>
    </div>
  );
}

function PriorityChipLabel(n: number): string {
  if (n <= 1) return 'Urgent';
  if (n <= 3) return 'Important';
  if (n <= 5) return 'Medium';
  return 'Low';
}
