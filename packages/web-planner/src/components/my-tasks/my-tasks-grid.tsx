import type { MyTasksResult, TaskWithPlan } from '@seta/planner';
import { AvatarStack, LabelChip } from '@seta/shared-ui';
import { Link } from '@tanstack/react-router';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown, Layout } from 'lucide-react';
import { useMemo, useState } from 'react';
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

const col = createColumnHelper<MyTasksRowTask>();

export function MyTasksGrid({ data }: Props) {
  const rows = useMemo(() => flatten(data), [data]);
  const [sorting, setSorting] = useState<SortingState>([]);
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

  const columns = useMemo(
    () => [
      col.accessor('title', {
        header: 'Task',
        cell: ({ row }) => (
          <Link
            to="/planner/plans/$planId/tasks/$taskId"
            params={{ planId: row.original.plan_id, taskId: row.original.id }}
            className="text-ink hover:text-primary no-underline font-medium truncate block"
          >
            {row.original.title}
          </Link>
        ),
      }),
      col.accessor((r) => r.plan.name, {
        id: 'plan',
        header: 'Plan',
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5 text-ink-muted text-[12.5px] truncate">
            <Layout size={11} className="text-primary shrink-0" />
            <span className="truncate">{row.original.plan.name}</span>
          </span>
        ),
      }),
      col.accessor('priority_number', {
        header: 'Priority',
        cell: ({ row }) => <PriorityChip prio={row.original.priority_number} />,
      }),
      col.accessor('percent_complete', {
        header: 'Progress',
        cell: ({ row }) => {
          const status = deriveTaskStatus(row.original);
          return <ProgressBar pct={row.original.percent_complete} status={status} />;
        },
      }),
      col.accessor('due_at', {
        header: 'Due',
        cell: (info) => {
          const v = info.getValue() as string | null;
          if (!v) return <span className="text-ink-tertiary">—</span>;
          const d = new Date(v);
          if (Number.isNaN(d.getTime())) return <span className="text-ink-tertiary">—</span>;
          return (
            <span className="text-ink-muted text-[12.5px]">
              {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          );
        },
      }),
      col.display({
        id: 'labels',
        header: 'Labels',
        cell: ({ row }) => (
          <div className="flex gap-1 flex-nowrap overflow-hidden">
            {row.original.labels.slice(0, 2).map((l) => (
              <LabelChip key={l.id} name={l.name} color={l.color} />
            ))}
          </div>
        ),
      }),
      col.display({
        id: 'assignees',
        header: 'Assignees',
        cell: ({ row }) => <AvatarStack assignees={row.original.assignees} max={2} />,
      }),
    ],
    [],
  );

  // TanStack Table returns functions that can't be safely memoized — React Compiler skips this hook
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <table data-testid="my-tasks-grid" className="w-full text-[13px] border-collapse">
      <thead className="sticky top-0 z-10 bg-canvas">
        {table.getHeaderGroups().map((hg) => (
          <tr
            key={hg.id}
            className="border-b border-hairline text-[10.5px] uppercase tracking-[0.06em] text-ink-subtle"
          >
            <th className="w-10 px-7 py-2.5 text-left">
              <input
                type="checkbox"
                aria-label="Select all"
                checked={allChecked}
                ref={(el) => {
                  if (el) el.indeterminate = someChecked;
                }}
                onChange={toggleAll}
                className="align-middle cursor-pointer"
              />
            </th>
            {hg.headers.map((h) => {
              const canSort = h.column.getCanSort();
              const sortDir = h.column.getIsSorted();
              return (
                <th
                  key={h.id}
                  onClick={canSort ? h.column.getToggleSortingHandler() : undefined}
                  className={
                    'text-left font-medium px-3 py-2.5 select-none ' +
                    (canSort ? 'cursor-pointer hover:text-ink' : '')
                  }
                >
                  <span className="inline-flex items-center gap-1">
                    {flexRender(h.column.columnDef.header, h.getContext())}
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
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((r) => {
          const isSelected = selection.has(r.original.id);
          return (
            <tr
              key={r.id}
              data-task-id={r.original.id}
              data-selected={isSelected ? 'true' : undefined}
              className={
                'border-b border-hairline-tertiary hover:bg-surface-1 transition-colors ' +
                (isSelected ? 'bg-primary-tint/30' : '')
              }
            >
              <td className="px-7 py-2.5 align-middle">
                <input
                  type="checkbox"
                  aria-label={`Select ${r.original.title}`}
                  checked={isSelected}
                  onChange={() => toggle(r.original.id)}
                  className="align-middle cursor-pointer"
                />
              </td>
              {r.getVisibleCells().map((c) => (
                <td key={c.id} className="px-3 py-2.5 align-middle">
                  {flexRender(c.column.columnDef.cell, c.getContext())}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
