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
import { useMemo, useState } from 'react';
import { deriveTaskStatus } from '../../lib/derive-task-status';
import type { MyTasksRowAssignee, MyTasksRowLabel, MyTasksRowTask } from './mt-task-row';
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

  const columns = useMemo(
    () => [
      col.accessor('title', {
        header: 'Task',
        cell: ({ row }) => (
          <Link
            to="/planner/plans/$planId/tasks/$taskId"
            params={{ planId: row.original.plan_id, taskId: row.original.id }}
            className="text-ink hover:text-primary no-underline font-medium"
          >
            {row.original.title}
          </Link>
        ),
      }),
      col.accessor((r) => r.plan.name, {
        id: 'plan',
        header: 'Plan',
        cell: (info) => (
          <span className="text-ink-muted text-[12.5px]">{info.getValue() as string}</span>
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
        cell: ({ row }) => {
          const labels = (row.original.labels ?? []) as ReadonlyArray<MyTasksRowLabel>;
          return (
            <div className="flex gap-1 flex-nowrap overflow-hidden">
              {labels.slice(0, 2).map((l) => (
                <LabelChip key={l.name} name={l.name} color={l.color ?? 'blue'} />
              ))}
            </div>
          );
        },
      }),
      col.display({
        id: 'assignees',
        header: 'Assignees',
        cell: ({ row }) => {
          const assignees = (row.original.assignees ?? []) as ReadonlyArray<MyTasksRowAssignee>;
          return <AvatarStack assignees={assignees} max={2} />;
        },
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
      <thead className="text-[10.5px] uppercase tracking-[0.06em] text-ink-subtle">
        {table.getHeaderGroups().map((hg) => (
          <tr key={hg.id} className="border-b border-hairline-tertiary">
            {hg.headers.map((h) => (
              <th
                key={h.id}
                onClick={h.column.getCanSort() ? h.column.getToggleSortingHandler() : undefined}
                className="text-left font-medium px-3 py-2 select-none cursor-pointer"
              >
                {flexRender(h.column.columnDef.header, h.getContext())}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((r) => (
          <tr
            key={r.id}
            data-task-id={r.original.id}
            className="border-b border-hairline-tertiary hover:bg-surface-1"
          >
            {r.getVisibleCells().map((c) => (
              <td key={c.id} className="px-3 py-2 align-middle">
                {flexRender(c.column.columnDef.cell, c.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
