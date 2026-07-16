import {
  Avatar,
  Card,
  cn,
  createStaticSource,
  DataTable,
  EmptyState,
  Input,
  PageChrome,
  type SearchableItem,
  SegmentedControl,
  Typeahead,
} from '@seta/shared-ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { ColumnDef, Row, VisibilityState } from '@tanstack/react-table';
import { BarChart3, Settings2, User, X } from 'lucide-react';
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type AllocationBucket,
  type AllocationGrid,
  type AllocationGridFilters,
  type AllocationGridRow,
  type AllocationStatus,
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

function formatLoad(pct: number): string {
  const frac = pct / 100;
  return Number.isInteger(frac) ? frac.toFixed(1) : String(frac);
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
    <Card padding={4}>
      <div className="text-[11px] uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold" style={color ? { color } : undefined}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-ink-muted">{sub}</div>}
    </Card>
  );
}

export interface AllocationSearch {
  q?: string;
  status?: AllocationStatus;
  account?: string;
  project?: string;
  bucket?: AllocationBucket;
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'over', label: 'Over-allocated' },
  { value: 'under', label: 'Under-utilized' },
] as const;

const BUCKET_OPTIONS = [
  { value: 'billable', label: 'Billable' },
  { value: 'internal', label: 'Internal' },
  { value: 'bench', label: 'Bench' },
];

/** Human labels for the custom Columns menu — not derived from columnDef.header (month cols use JSX). */
export const ALLOCATION_HIDEABLE_COLUMNS = [
  { id: 'employee_no', label: 'Employee ID' },
  { id: 'account', label: 'Account' },
  { id: 'project', label: 'Project' },
  ...MONTHS.map((label, mi) => ({ id: `m${mi}`, label })),
  { id: 'total_mm', label: 'MM' },
] as const;

export function AllocationPage() {
  const navigate = useNavigate();
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const columnsMenuRef = useRef<HTMLDivElement>(null);

  // Column visibility is a persistent multi-toggle menu — it must stay open across
  // clicks. Astryx's DropdownMenuItem always closes the menu on click (no
  // checkbox-item equivalent), so this stays a bespoke popover until the D2 batch
  // rebuilds it on Astryx Popover + Checkbox.
  useEffect(() => {
    if (!columnsMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(e.target as Node)) {
        setColumnsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [columnsMenuOpen]);

  // Every filter lives in the URL, so refresh / back / share restores the exact view.
  const raw = useSearch({ strict: false }) as Partial<AllocationSearch>;
  const setSearch = useCallback(
    (patch: Partial<AllocationSearch>): void => {
      void navigate({
        to: '/people/allocation',
        search: { ...raw, ...patch },
        replace: true,
      });
    },
    [navigate, raw],
  );

  // Text input is local for responsiveness; its committed value is debounced into the URL.
  const [searchInput, setSearchInput] = useState(raw.q ?? '');
  useEffect(() => {
    setSearchInput(raw.q ?? '');
  }, [raw.q]);
  useEffect(() => {
    const next = searchInput.trim();
    if (next === (raw.q ?? '')) return;
    const t = setTimeout(() => setSearch({ q: next || undefined }), 250);
    return () => clearTimeout(t);
  }, [searchInput, raw.q, setSearch]);

  const filters = useMemo<AllocationGridFilters>(
    () => ({
      search: raw.q || undefined,
      status: raw.status,
      accountId: raw.account || undefined,
      projectId: raw.project || undefined,
      bucket: raw.bucket,
    }),
    [raw.q, raw.status, raw.account, raw.project, raw.bucket],
  );

  const { data, isLoading, error } = useQuery<AllocationGrid>({
    queryKey: peopleKeys.allocationGrid(filters),
    queryFn: () => fetchAllocationGrid(filters),
    placeholderData: keepPreviousData,
  });

  const accountItems = useMemo<SearchableItem[]>(
    () => (data?.facets.accounts ?? []).map((a) => ({ id: a.id, label: a.name })),
    [data],
  );
  const accountSource = useMemo(() => createStaticSource(accountItems), [accountItems]);
  const accountValue = accountItems.find((a) => a.id === raw.account) ?? null;

  const projectItems = useMemo<SearchableItem[]>(
    () =>
      (data?.facets.projects ?? [])
        .filter((p) => !raw.account || p.account_id === raw.account)
        .map((p) => ({ id: p.id, label: p.name })),
    [data, raw.account],
  );
  const projectSource = useMemo(() => createStaticSource(projectItems), [projectItems]);
  const projectValue = projectItems.find((p) => p.id === raw.project) ?? null;

  const bucketItems = useMemo<SearchableItem[]>(
    () => BUCKET_OPTIONS.map((b) => ({ id: b.value, label: b.label })),
    [],
  );
  const bucketSource = useMemo(() => createStaticSource(bucketItems), [bucketItems]);
  const bucketValue = bucketItems.find((b) => b.id === raw.bucket) ?? null;

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
              {v == null ? '' : formatLoad(v)}
            </span>
          </div>
        );
      },
    }));
    return [
      {
        id: 'employee_no',
        header: 'Employee ID',
        cell: ({ row }) => (
          <span className="font-mono text-[11px] text-ink-muted">
            {row.original.employee_no ?? '—'}
          </span>
        ),
      },
      {
        id: 'name',
        header: 'Name',
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex w-44 items-center gap-2.5">
            <Avatar name={row.original.full_name} size={32} />
            <span className="font-medium leading-tight">{row.original.full_name}</span>
          </div>
        ),
      },
      {
        id: 'account',
        header: 'Account',
        cell: ({ row }) => (
          <div className="max-w-[160px] truncate">{row.original.account_name || '—'}</div>
        ),
      },
      {
        id: 'project',
        header: 'Project',
        cell: ({ row }) =>
          // AMs manage the whole account, not a single project — show that instead of a sub-project.
          row.original.is_account_am ? (
            <span className="text-[12px] text-ink-subtle italic">Account management</span>
          ) : (
            <div className="max-w-[200px] truncate">{row.original.project_name ?? '—'}</div>
          ),
      },
      ...monthCols,
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
  const rowCount = data?.rows.length ?? 0;
  const activeFiltersCount = [raw.q, raw.status, raw.account, raw.project, raw.bucket].filter(
    Boolean,
  ).length;

  return (
    <PageChrome title="Resource Allocation">
      <div className="space-y-4 p-6">
        {error ? (
          <Card className="p-4 text-body-sm text-[color:var(--color-danger)]">
            {(error as Error).message}
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

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <Input
                    label="Search name or worker ID"
                    isLabelHidden
                    className="w-64"
                    size="sm"
                    placeholder="Search name or worker ID…"
                    value={searchInput}
                    onChange={(value) => setSearchInput(value)}
                  />
                  <span className="hidden text-ink-tertiary select-none sm:inline">|</span>
                  {activeFiltersCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchInput('');
                        setSearch({
                          q: undefined,
                          status: undefined,
                          account: undefined,
                          project: undefined,
                          bucket: undefined,
                        });
                      }}
                      className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-primary transition-opacity hover:opacity-80 focus:outline-none"
                    >
                      <X className="size-3.5" />
                      Clear filters ({activeFiltersCount})
                    </button>
                  )}
                  <div className="flex items-center gap-2 text-body-sm text-ink-muted">
                    <span className="flex items-center gap-1 font-medium text-ink">
                      <User className="size-3.5 text-ink-muted" />
                      {rowCount} {rowCount === 1 ? 'row' : 'rows'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div ref={columnsMenuRef} className="relative">
                    <button
                      type="button"
                      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-surface-2 focus:outline-none"
                      onClick={() => setColumnsMenuOpen((v) => !v)}
                    >
                      <Settings2 className="size-3.5" />
                      Columns
                    </button>
                    {columnsMenuOpen && (
                      <div
                        role="menu"
                        aria-label="Toggle columns"
                        className="absolute right-0 z-50 mt-1 min-w-[180px] rounded-md border border-hairline bg-surface-3 p-1 text-ink shadow-lg"
                      >
                        <div className="px-2 py-1.5 text-eyebrow uppercase tracking-[0.04em] text-ink-subtle">
                          Toggle columns
                        </div>
                        <div className="-mx-1 my-1 h-px bg-hairline" />
                        {ALLOCATION_HIDEABLE_COLUMNS.map((col) => {
                          const isVisible = columnVisibility[col.id] ?? true;
                          return (
                            <label
                              key={col.id}
                              className="flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-body-sm text-ink hover:bg-surface-4"
                            >
                              <input
                                type="checkbox"
                                checked={isVisible}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setColumnVisibility((prev) => ({
                                    ...prev,
                                    [col.id]: checked,
                                  }));
                                }}
                              />
                              {col.label}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <SegmentedControl<'all' | AllocationStatus>
                  aria-label="Allocation status"
                  value={raw.status ?? 'all'}
                  onValueChange={(v) => setSearch({ status: v === 'all' ? undefined : v })}
                  options={STATUS_OPTIONS}
                />
                <Typeahead
                  className="h-8 w-44"
                  label="Account"
                  isLabelHidden
                  searchSource={accountSource}
                  debounceMs={0}
                  hasEntriesOnFocus
                  value={accountValue}
                  onChange={(item) =>
                    setSearch({ account: item?.id ?? undefined, project: undefined })
                  }
                  placeholder="All accounts"
                />
                <Typeahead
                  className="h-8 w-44"
                  label="Project"
                  isLabelHidden
                  searchSource={projectSource}
                  debounceMs={0}
                  hasEntriesOnFocus
                  value={projectValue}
                  onChange={(item) => setSearch({ project: item?.id ?? undefined })}
                  placeholder="All projects"
                />
                <Typeahead
                  className="h-8 w-36"
                  label="Bucket"
                  isLabelHidden
                  searchSource={bucketSource}
                  debounceMs={0}
                  hasEntriesOnFocus
                  value={bucketValue}
                  onChange={(item) =>
                    setSearch({ bucket: (item?.id as AllocationBucket) ?? undefined })
                  }
                  placeholder="All buckets"
                />
              </div>

              <div className="flex justify-end">
                <HeatLegend />
              </div>
            </div>

            <DataTable
              columns={columns}
              data={data?.rows ?? []}
              isLoading={isLoading}
              density="compact"
              getRowClassName={rowClassName}
              enableGlobalFilter={false}
              enableColumnVisibility={false}
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={setColumnVisibility}
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
