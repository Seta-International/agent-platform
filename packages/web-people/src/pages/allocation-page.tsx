import { Badge, Card, CardContent, DataTable, EmptyState, PageChrome } from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { BarChart3 } from 'lucide-react';
import { useMemo } from 'react';
import {
  type AllocationGrid,
  type AllocationGridRow,
  fetchAllocationGrid,
} from '../api/allocation-client.ts';
import { peopleKeys } from '../state/query-keys.ts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'positive' | 'warning' | 'accent';
}) {
  const color =
    tone === 'positive'
      ? 'var(--positive)'
      : tone === 'warning'
        ? 'var(--warning)'
        : tone === 'accent'
          ? 'var(--accent)'
          : undefined;
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-ink-muted">{label}</div>
        <div className="mt-1 text-2xl font-semibold" style={color ? { color } : undefined}>
          {value}
        </div>
        {sub && <div className="text-[11px] text-ink-muted">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export function AllocationPage() {
  const navigate = useNavigate();
  const canReadAll = usePermission('people.worker.read.all');

  const { data, isLoading, error } = useQuery<AllocationGrid>({
    queryKey: peopleKeys.allocationGrid(),
    queryFn: () => fetchAllocationGrid(),
  });

  const overByWorkerMonth = useMemo(() => {
    const m = new Map<string, Set<number>>();
    for (const w of data?.worker_totals ?? []) m.set(w.worker_id, new Set(w.over_months));
    return m;
  }, [data]);
  const totalsByWorker = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const w of data?.worker_totals ?? []) m.set(w.worker_id, w.totals);
    return m;
  }, [data]);

  const columns = useMemo<ColumnDef<AllocationGridRow>[]>(() => {
    const monthCols: ColumnDef<AllocationGridRow>[] = MONTHS.map((label, mi) => ({
      id: `m${mi}`,
      header: () => <div className="text-center">{label}</div>,
      enableSorting: false,
      cell: ({ row }) => {
        const r = row.original;
        const v = r.months[mi];
        const isOver = v != null && (overByWorkerMonth.get(r.worker_id)?.has(mi) ?? false);
        const total = totalsByWorker.get(r.worker_id)?.[mi];
        return (
          <div
            className="text-center font-mono text-[12px]"
            title={isOver ? `Total ${total}% this month` : undefined}
          >
            <span
              className={isOver ? 'rounded-sm px-1' : undefined}
              style={
                isOver ? { outline: '1px solid var(--accent)', outlineOffset: '-1px' } : undefined
              }
            >
              {v == null ? '' : v}
            </span>
          </div>
        );
      },
    }));
    return [
      {
        id: 'name',
        accessorFn: (r) => `${r.full_name} ${r.worker_id}`,
        header: 'Name',
        cell: ({ row }) => <span className="font-medium">{row.original.full_name}</span>,
      },
      {
        accessorKey: 'account_name',
        header: 'Account',
        cell: ({ row }) => <span className="text-ink-muted">{row.original.account_name}</span>,
      },
      {
        accessorKey: 'project_name',
        header: 'Project',
        cell: ({ row }) => (
          <span className="text-ink-muted">{row.original.project_name ?? '—'}</span>
        ),
      },
      ...monthCols,
      {
        accessorKey: 'ytd_pct',
        header: () => <div className="text-center">YTD%</div>,
        cell: ({ row }) => (
          <div className="text-center font-mono text-[12px]">{row.original.ytd_pct}</div>
        ),
      },
      {
        accessorKey: 'fy_pct',
        header: () => <div className="text-center">FY%</div>,
        cell: ({ row }) => (
          <div className="text-center font-mono text-[12px]">{row.original.fy_pct}</div>
        ),
      },
      {
        accessorKey: 'total_mm',
        header: () => <div className="text-center">MM</div>,
        cell: ({ row }) => (
          <div className="text-center font-mono text-[12px]">
            {row.original.total_mm.toFixed(2)}
          </div>
        ),
      },
    ];
  }, [overByWorkerMonth, totalsByWorker]);

  const kpis = data?.kpis;

  return (
    <PageChrome title="Resource Allocation">
      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-body-sm text-ink-muted">
            Monthly staffing grid — planned % across {data?.year ?? 'the year'}.
            {!canReadAll && ' Scoped to people related to you.'}
          </p>
          {!canReadAll && (
            <Badge variant="outline" title="You see only people related to you">
              Scoped view
            </Badge>
          )}
        </div>

        {error ? (
          <Card>
            <CardContent className="p-4 text-body-sm text-[color:var(--accent)]">
              {(error as Error).message}
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Kpi
                label="Avg. utilization"
                value={`${kpis?.avg_utilization ?? 0}%`}
                sub="target ≥ 85%"
                tone={(kpis?.avg_utilization ?? 0) >= 85 ? 'positive' : 'warning'}
              />
              <Kpi
                label="Over-allocated"
                value={`${kpis?.over_allocated_count ?? 0}`}
                sub="> 100% some month"
                tone={kpis?.over_allocated_count ? 'accent' : 'positive'}
              />
              <Kpi
                label="Members"
                value={`${kpis?.member_count ?? 0}`}
                sub={`${kpis?.project_count ?? 0} projects`}
              />
            </div>

            <DataTable
              columns={columns}
              data={data?.rows ?? []}
              isLoading={isLoading}
              globalFilterPlaceholder="Search name or worker ID…"
              pagination={{ defaultPageSize: 25, pageSizeOptions: [25, 50, 100] }}
              emptyState={
                <EmptyState
                  icon={<BarChart3 className="size-6" />}
                  title="No allocations"
                  description="No one is allocated in your view for this year."
                />
              }
              onRowClick={(row) =>
                void navigate({
                  to: '/people/employees/$workerId',
                  params: { workerId: row.original.worker_id },
                })
              }
            />
            <p className="text-[11px] text-ink-muted">
              Red outline = that person is over 100% allocated that month.
            </p>
          </>
        )}
      </div>
    </PageChrome>
  );
}
