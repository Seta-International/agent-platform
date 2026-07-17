import type { MyTasksResult, TaskWithPlan } from '@seta/planner';
import { AvatarStack, Checkbox, CounterBadgePopover } from '@seta/shared-ui';
import { Link } from '@tanstack/react-router';
import { ArrowDown, ArrowUp, ChevronsUpDown, Layout } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { deriveTaskStatus } from '../../lib/derive-task-status';
import type { MyTasksRowTask } from './mt-task-row';
import { PriorityChip } from './priority-chip';
import { ProgressBar } from './progress-bar';

interface Props {
  data: MyTasksResult;
}

function flatten(data: MyTasksResult): MyTasksRowTask[] {
  const all: ReadonlyArray<TaskWithPlan> = [
    ...data.late,
    ...data.dueThisWeek,
    ...data.inProgress,
    ...data.notStarted,
    ...data.recentlyCompleted,
  ];
  return all.map((t) => t as MyTasksRowTask);
}

type SortDir = 'asc' | 'desc';
type SortState = { key: string; dir: SortDir } | null;
type SortValue = string | number | null;

interface GridColumn {
  id: string;
  header: string;
  // Present => column is sortable; extracts the client-side sort key for a row.
  sortValue?: (r: MyTasksRowTask) => SortValue;
  renderCell: (r: MyTasksRowTask) => ReactNode;
}

// Mirror TanStack's default `auto` sorting fn: numeric compare for numbers,
// case-insensitive alphanumeric for strings. Per table-core's `toString`, a null value
// collapses to '' (so nulls sort FIRST under asc, last under desc) — table-core's
// `sortUndefined` special-case fires only for `undefined`, never `null`.
function compareValues(a: SortValue, b: SortValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const sa = a === null ? '' : String(a);
  const sb = b === null ? '' : String(b);
  return sa.localeCompare(sb, undefined, { sensitivity: 'base', numeric: true });
}

function formatDueShort(v: string | null): ReactNode {
  if (!v) return <span className="text-ink-tertiary">—</span>;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return <span className="text-ink-tertiary">—</span>;
  return (
    <span className="text-ink-muted text-[12.5px]">
      {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
    </span>
  );
}

export function MyTasksGrid({ data }: Props) {
  const rows = useMemo(() => flatten(data), [data]);
  const [sort, setSort] = useState<SortState>(null);
  const [selection, setSelection] = useState<ReadonlySet<string>>(() => new Set());

  function toggle(id: string) {
    const next = new Set(selection);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelection(next);
  }
  function toggleAll() {
    if (selection.size === rows.length) setSelection(new Set());
    else setSelection(new Set(rows.map((r) => r.id)));
  }

  const allChecked = rows.length > 0 && selection.size === rows.length;
  const someChecked = selection.size > 0 && selection.size < rows.length;

  const columns = useMemo<GridColumn[]>(
    () => [
      {
        id: 'title',
        header: 'Task',
        sortValue: (r) => r.title,
        renderCell: (r) => (
          <Link
            to="/planner/plans/$planId/tasks/$taskId"
            params={{ planId: r.plan_id, taskId: r.id }}
            className="text-ink hover:text-primary no-underline font-medium truncate block"
          >
            {r.title}
          </Link>
        ),
      },
      {
        id: 'plan',
        header: 'Plan',
        sortValue: (r) => r.plan.name,
        renderCell: (r) => (
          <span className="inline-flex items-center gap-1.5 text-ink-muted text-[12.5px] truncate">
            <Layout size={11} className="text-primary shrink-0" />
            <span className="truncate">{r.plan.name}</span>
          </span>
        ),
      },
      {
        id: 'priority_number',
        header: 'Priority',
        sortValue: (r) => r.priority_number,
        renderCell: (r) => <PriorityChip prio={r.priority_number} />,
      },
      {
        id: 'percent_complete',
        header: 'Progress',
        sortValue: (r) => r.percent_complete,
        renderCell: (r) => <ProgressBar pct={r.percent_complete} status={deriveTaskStatus(r)} />,
      },
      {
        id: 'due_at',
        header: 'Due',
        sortValue: (r) => r.due_at ?? null,
        renderCell: (r) => formatDueShort(r.due_at),
      },
      {
        id: 'labels',
        header: 'Labels',
        renderCell: (r) => (
          <CounterBadgePopover items={r.labels} title="Labels" limit={2} type="label-chip" />
        ),
      },
      {
        id: 'assignees',
        header: 'Assignees',
        renderCell: (r) => <AvatarStack assignees={r.assignees} max={2} />,
      },
    ],
    [],
  );

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.id === sort.key);
    if (!column?.sortValue) return rows;
    const get = column.sortValue;
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => compareValues(get(a), get(b)) * factor);
  }, [rows, sort, columns]);

  // First-click direction, reproducing table-core's getAutoSortDir/getFirstSortDir:
  // no `sortDescFirst` set, so it falls back to the first (pre-sort) row's value type —
  // `string` sorts asc-first, everything else (numbers, null) desc-first.
  function firstSortDir(column: GridColumn): SortDir {
    const first = rows[0];
    const value = first !== undefined ? column.sortValue?.(first) : undefined;
    return typeof value === 'string' ? 'asc' : 'desc';
  }

  // Cycle firstDir -> opposite -> unsorted, matching table-core's getNextSortingOrder
  // with the default enableSortingRemoval=true.
  function toggleSort(column: GridColumn) {
    const first = firstSortDir(column);
    const opposite: SortDir = first === 'asc' ? 'desc' : 'asc';
    setSort((prev) => {
      if (prev?.key !== column.id) return { key: column.id, dir: first };
      if (prev.dir === first) return { key: column.id, dir: opposite };
      return null;
    });
  }

  return (
    <table data-testid="my-tasks-grid" className="w-full text-[13px] border-collapse">
      <thead className="sticky top-0 z-10 bg-canvas">
        <tr className="border-b border-hairline text-[10.5px] uppercase tracking-[0.06em] text-ink-subtle">
          <th className="w-10 px-7 py-2.5 text-left">
            <Checkbox
              label="Select all"
              isLabelHidden
              value={someChecked ? 'indeterminate' : allChecked}
              onChange={toggleAll}
            />
          </th>
          {columns.map((c) => {
            const canSort = c.sortValue !== undefined;
            const sortDir = sort?.key === c.id ? sort.dir : false;
            return (
              <th
                key={c.id}
                onClick={canSort ? () => toggleSort(c) : undefined}
                className={
                  'text-left font-medium px-3 py-2.5 select-none ' +
                  (canSort ? 'cursor-pointer hover:text-ink' : '')
                }
              >
                <span className="inline-flex items-center gap-1">
                  {c.header}
                  {canSort &&
                    (sortDir === 'asc' ? (
                      <ArrowUp size={10} aria-hidden />
                    ) : sortDir === 'desc' ? (
                      <ArrowDown size={10} aria-hidden />
                    ) : (
                      <ChevronsUpDown size={10} className="opacity-30" aria-hidden />
                    ))}
                </span>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {sortedRows.map((r) => {
          const isSelected = selection.has(r.id);
          return (
            <tr
              key={r.id}
              data-task-id={r.id}
              data-selected={isSelected ? 'true' : undefined}
              className={
                'border-b border-hairline-tertiary hover:bg-surface-1 transition-colors ' +
                (isSelected ? 'bg-primary-tint/30' : '')
              }
            >
              <td className="px-7 py-2.5 align-middle">
                <Checkbox
                  label={`Select ${r.title}`}
                  isLabelHidden
                  value={isSelected}
                  onChange={() => toggle(r.id)}
                />
              </td>
              {columns.map((c) => (
                <td key={c.id} className="px-3 py-2.5 align-middle">
                  {c.renderCell(r)}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
