import {
  Badge,
  Card,
  CardContent,
  cn,
  DataTable,
  EmptyState,
  Input,
  PageChrome,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ColumnDef, Row } from '@tanstack/react-table';
import { BarChart3 } from 'lucide-react';
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from 'react';
import {
  type AllocationGrid,
  type AllocationGridRow,
  fetchAllocationGrid,
} from '../api/allocation-client.ts';
import { UtilizationPanel } from '../components/utilization-panel.tsx';
import { peopleKeys } from '../state/query-keys.ts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Heatmap fill by planned-allocation level (matches the design prototype): green = fully loaded,
// blue = high, amber = mid, red = light. Empty/zero months stay uncolored.
function heatStyle(v: number | null | undefined): CSSProperties {
  if (v == null || v === 0) return {};
  if (v >= 100)
    return { background: 'var(--color-success-tint)', color: 'var(--color-success-ink)' };
  if (v >= 75) return { background: 'var(--color-info-tint)', color: 'var(--color-info-ink)' };
  if (v >= 50)
    return { background: 'var(--color-warning-tint)', color: 'var(--color-warning-ink)' };
  return { background: 'var(--color-danger-tint)', color: 'var(--color-danger-ink)' };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

const HEAT_LEVELS = [
  { label: '≥100', token: 'success' },
  { label: '75–99', token: 'info' },
  { label: '50–74', token: 'warning' },
  { label: '<50', token: 'danger' },
] as const;

function HeatLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-ink-muted">
      <span className="font-medium">Planned load</span>
      {HEAT_LEVELS.map((l) => (
        <span key={l.label} className="inline-flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-[3px]"
            style={{
              background: `var(--color-${l.token}-tint)`,
              boxShadow: `inset 0 0 0 1px var(--color-${l.token})`,
            }}
          />
          {l.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-[3px]" style={{ background: 'var(--color-danger)' }} />
        over 100%
      </span>
    </div>
  );
}

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
      ? 'var(--color-success)'
      : tone === 'warning'
        ? 'var(--color-warning)'
        : tone === 'accent'
          ? 'var(--color-danger)'
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

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, error } = useQuery<AllocationGrid>({
    queryKey: peopleKeys.allocationGrid(undefined, debouncedSearch),
    queryFn: () => fetchAllocationGrid(undefined, debouncedSearch || undefined),
    placeholderData: keepPreviousData,
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

  // Rows arrive grouped per worker (backend sorts by name); the band parity just alternates the
  // shade between adjacent person-groups so a worker's projects read as one block.
  const workerBand = useMemo(() => {
    const m = new Map<string, number>();
    let idx = 0;
    for (const r of data?.rows ?? []) if (!m.has(r.worker_id)) m.set(r.worker_id, idx++);
    return m;
  }, [data]);

  const rowClassName = useCallback(
    (row: Row<AllocationGridRow>) =>
      cn((workerBand.get(row.original.worker_id) ?? 0) % 2 === 1 && 'bg-surface-1'),
    [workerBand],
  );

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
        // Over-allocated months are filled solid danger (not outlined); otherwise the heat fill.
        const style: CSSProperties = isOver
          ? { background: 'var(--color-danger)', color: '#fff' }
          : heatStyle(v);
        return (
          <div className="flex justify-center">
            <span
              className="inline-block w-9 rounded-[5px] py-0.5 text-center font-mono text-[11px] font-semibold tabular-nums"
              title={isOver ? `Total ${total}% this month` : undefined}
              style={style}
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
        header: 'Name',
        cell: ({ row }) => (
          <div className="flex w-44 items-center gap-2">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[10px] font-semibold text-ink-muted">
              {initials(row.original.full_name)}
            </span>
            <span className="line-clamp-2 font-medium leading-tight">{row.original.full_name}</span>
          </div>
        ),
      },
      {
        id: 'engagement',
        header: 'Project',
        cell: ({ row }) => {
          const { account_name, project_name } = row.original;
          const project = project_name ?? '—';
          // Account is redundant when it just repeats the project name (common for internal work).
          const showAccount =
            account_name && account_name !== project_name && !project.startsWith(account_name);
          return (
            <div className="min-w-0 max-w-[220px]">
              <div className="truncate">{project}</div>
              {showAccount && (
                <div className="truncate text-[11px] text-ink-subtle">{account_name}</div>
              )}
            </div>
          );
        },
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
        {!canReadAll && (
          <div className="flex justify-end">
            <Badge variant="outline" title="You see only people related to you">
              Scoped view
            </Badge>
          </div>
        )}

        {error ? (
          <Card>
            <CardContent className="p-4 text-body-sm text-[color:var(--color-danger)]">
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

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Input
                className="h-8 max-w-xs"
                placeholder="Search name or worker ID…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <HeatLegend />
            </div>

            <DataTable
              columns={columns}
              data={data?.rows ?? []}
              isLoading={isLoading}
              getRowClassName={rowClassName}
              enableGlobalFilter={false}
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
              Solid red = that person is over 100% allocated that month.
            </p>
            <UtilizationPanel />
          </>
        )}
      </div>
    </PageChrome>
  );
}
