import {
  Avatar,
  BreadcrumbItem,
  Breadcrumbs,
  Button,
  Card,
  Checkbox,
  type ColumnSettingsOption,
  cn,
  createStaticSource,
  DonutChart,
  type DonutSlice,
  EmptyState,
  HStack,
  Input,
  Layout,
  LayoutContent,
  LayoutHeader,
  PaginationFooter,
  Popover,
  paginateData,
  pixel,
  proportional,
  type SearchableItem,
  SegmentedControl,
  SegmentedControlItem,
  Skeleton,
  Table,
  type TableColumn,
  Text,
  Typeahead,
  useTableColumnSettings,
  useTableColumnSettingsState,
  useTableSortable,
  useTableSortableState,
  VStack,
} from '@seta/shared-ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { BarChart3, Building2, Download, Settings2, User, X } from 'lucide-react';
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from 'react';
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
import { exportAllocationCsv, formatLoad } from './export-allocation-csv.ts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Collapse the donut legend when many accounts; matches the portfolio summary in the mock. */
const EFFORT_DONUT_TOP_N = 6;

const EFFORT_PALETTE = [
  '#F59E0B',
  '#1E3A5F',
  '#9333EA',
  '#00A3A3',
  '#0047FF',
  '#4F46E5',
  '#16A34A',
  '#DC2626',
  '#0891B2',
  '#DB2777',
] as const;

// Astryx Table columns require `T extends Record<string, unknown>`; the DTO
// lacks an index signature, so alias locally (do not touch the shared DTO).
type AllocationRow = AllocationGridRow & Record<string, unknown>;

// Heatmap fill by planned-allocation level (matches the design prototype): green = fully loaded,
// blue = high, amber = mid, red = light. Empty/zero months stay uncolored.
function heatStyle(v: number | null | undefined): CSSProperties {
  if (v == null || v === 0) return {};
  if (v >= 100)
    return { background: 'var(--color-success-muted)', color: 'var(--color-text-green)' };
  if (v >= 75)
    return { background: 'var(--color-background-blue)', color: 'var(--color-text-blue)' };
  if (v >= 50)
    return { background: 'var(--color-warning-muted)', color: 'var(--color-text-yellow)' };
  return { background: 'var(--color-error-muted)', color: 'var(--color-text-red)' };
}

const HEAT_LEVELS = [
  { label: '≥100', token: 'success' },
  { label: '75–99', token: 'info' },
  { label: '50–74', token: 'warning' },
  { label: '<50', token: 'danger' },
] as const;

function HeatLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-secondary">
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
        <span className="size-2.5 rounded-[3px]" style={{ background: 'var(--color-error)' }} />
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
          ? 'var(--color-error)'
          : undefined;
  return (
    <Card padding={4}>
      <div className="text-xs uppercase tracking-wide text-secondary">{label}</div>
      <div className="mt-1 text-2xl font-semibold" style={color ? { color } : undefined}>
        {value}
      </div>
      {sub && <div className="text-xs text-secondary">{sub}</div>}
    </Card>
  );
}

export interface AllocationSearch {
  q?: string;
  status?: AllocationStatus;
  account?: string;
  project?: string;
  bucket?: AllocationBucket;
  /** Show all projects for workers already in scope (AM/EM cross-project load). */
  crossProject?: boolean;
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

/** Human labels for the column-settings picker — not derived from column.header (month cols use JSX). */
export const ALLOCATION_HIDEABLE_COLUMNS: ColumnSettingsOption[] = [
  { key: 'employee_no', label: 'Employee ID' },
  { key: 'account', label: 'Account' },
  { key: 'project', label: 'Project' },
  ...MONTHS.map((label, mi) => ({ key: `m${mi}`, label })),
  { key: 'total_mm', label: 'MM' },
];
const ALLOCATION_COLUMN_OPTIONS: ColumnSettingsOption[] = [
  { key: 'name', label: 'Name', isAlwaysVisible: true },
  ...ALLOCATION_HIDEABLE_COLUMNS,
];
const DEFAULT_ALLOCATION_COLUMN_KEYS = ALLOCATION_COLUMN_OPTIONS.map((c) => c.key);

const PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [PAGE_SIZE, 25, 50, 100];

export function AllocationPage() {
  const navigate = useNavigate();
  const [activeColumnKeys, setActiveColumnKeys] = useState<string[]>(
    DEFAULT_ALLOCATION_COLUMN_KEYS,
  );

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
      ...(raw.crossProject ? { crossProject: true } : {}),
    }),
    [raw.q, raw.status, raw.account, raw.project, raw.bucket, raw.crossProject],
  );

  const { data, isLoading, error } = useQuery<AllocationGrid>({
    queryKey: peopleKeys.allocationGrid(filters),
    queryFn: () => fetchAllocationGrid(filters),
    placeholderData: keepPreviousData,
  });

  const { sortedData, sort, sortConfig } = useTableSortableState<AllocationRow>({
    data: (data?.rows ?? []) as AllocationRow[],
    comparators: { total_mm: (a, b) => a.total_mm - b.total_mm },
  });
  const sortable = useTableSortable<AllocationRow>(sortConfig);

  // Client-side pagination over the (server-)filtered rows.
  // Reset to page 1 on filter/sort change — old TanStack autoResetPageIndex parity (see candidates-page).
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  // biome-ignore lint/correctness/useExhaustiveDependencies: filters and sort are the intentional reset triggers, unread in the body.
  useEffect(() => {
    setPage(1);
  }, [filters, sort]);

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

  const columns = useMemo<TableColumn<AllocationRow>[]>(() => {
    const monthCols: TableColumn<AllocationRow>[] = MONTHS.map((label, mi) => ({
      key: `m${mi}`,
      header: label,
      width: pixel(48),
      align: 'center',
      renderCell: (r) => {
        const v = r.months[mi];
        const isOver = v != null && (overByWorkerMonth.get(r.worker_id)?.has(mi) ?? false);
        const total = totalsByWorker.get(r.worker_id)?.[mi];
        // Over-allocated months are filled solid danger (not outlined); otherwise the heat fill.
        const style: CSSProperties = isOver
          ? { background: 'var(--color-error)', color: '#fff' }
          : heatStyle(v);
        return (
          <div className="flex justify-center">
            <span
              className="inline-block w-9 rounded-[5px] py-0.5 text-center font-mono text-xs font-semibold tabular-nums"
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
        key: 'employee_no',
        header: 'Employee ID',
        width: pixel(100),
        renderCell: (r) => (
          <span className="font-mono text-xs text-secondary">{r.employee_no ?? '—'}</span>
        ),
      },
      {
        key: 'name',
        header: 'Name',
        width: proportional(2),
        renderCell: (r) => (
          <div className="flex w-44 items-center gap-2.5">
            {/* Name is spelled out beside the avatar, so Astryx's name-on-hover
                tooltip would only duplicate it in the a11y tree. */}
            <Avatar name={r.full_name} size={32} tooltip={false} />
            <span className="font-medium leading-tight">{r.full_name}</span>
          </div>
        ),
      },
      {
        key: 'account',
        header: 'Account',
        width: proportional(1),
        renderCell: (r) => <div className="max-w-[160px] truncate">{r.account_name || '—'}</div>,
      },
      {
        key: 'project',
        header: 'Project',
        width: proportional(1),
        renderCell: (r) =>
          // AMs manage the whole account, not a single project — show that instead of a sub-project.
          r.is_account_am ? (
            <span className="text-sm text-secondary italic">Account management</span>
          ) : (
            <div className="max-w-[200px] truncate">{r.project_name ?? '—'}</div>
          ),
      },
      ...monthCols,
      {
        key: 'total_mm',
        header: 'MM',
        width: pixel(70),
        align: 'center',
        // The only column with a real accessor in the old TanStack config (the others were
        // `id`-only display columns whose "sort" button never actually reordered anything) —
        // preserved as the one genuinely-functioning sort; see task-2c report for detail.
        sortable: true,
        renderCell: (r) => (
          <div className="text-center font-mono text-sm">{r.total_mm.toFixed(2)}</div>
        ),
      },
    ];
  }, [overByWorkerMonth, totalsByWorker]);

  const pageRows = useMemo(
    () => paginateData(sortedData, page, pageSize),
    [sortedData, page, pageSize],
  );
  const columnSettingsState = useTableColumnSettingsState({
    columns: ALLOCATION_COLUMN_OPTIONS,
    activeColumnKeys,
    onChangeActiveColumnKeys: (keys) => setActiveColumnKeys([...keys]),
  });
  const columnSettings = useTableColumnSettings<AllocationRow>(
    columnSettingsState.columnSettingsConfig,
  );

  const kpis = data?.kpis;
  const effortByAccount = data?.effort_by_account ?? [];
  const effortTotalMm = useMemo(
    () => Math.round(effortByAccount.reduce((s, a) => s + a.total_mm, 0) * 100) / 100,
    [effortByAccount],
  );
  const [effortExpanded, setEffortExpanded] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset expand when the filtered set changes.
  useEffect(() => {
    setEffortExpanded(false);
  }, [effortByAccount]);
  const effortSlices = useMemo<DonutSlice[]>(() => {
    const source =
      effortExpanded || effortByAccount.length <= EFFORT_DONUT_TOP_N
        ? effortByAccount
        : (() => {
            const top = effortByAccount.slice(0, EFFORT_DONUT_TOP_N);
            const rest = effortByAccount.slice(EFFORT_DONUT_TOP_N);
            const otherMm = Math.round(rest.reduce((s, a) => s + a.total_mm, 0) * 100) / 100;
            return [
              ...top,
              {
                account_id: '__other__',
                account_name: `Other (${rest.length})`,
                total_mm: otherMm,
              },
            ];
          })();
    return source.map((a, i) => ({
      key: a.account_id,
      name: a.account_name || '—',
      value: Math.round(a.total_mm * 100) / 100,
      color: EFFORT_PALETTE[i % EFFORT_PALETTE.length] ?? EFFORT_PALETTE[0],
    }));
  }, [effortByAccount, effortExpanded]);
  const rowCount = data?.rows.length ?? 0;
  const activeFiltersCount = [
    raw.q,
    raw.status,
    raw.account,
    raw.project,
    raw.bucket,
    raw.crossProject ? '1' : undefined,
  ].filter(Boolean).length;

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={1}>
            <Breadcrumbs variant="supporting">
              <BreadcrumbItem href="/people">People</BreadcrumbItem>
              <BreadcrumbItem isCurrent>Resource Allocation</BreadcrumbItem>
            </Breadcrumbs>
            <HStack hAlign="between" vAlign="center" gap={2}>
              <HStack gap={2} vAlign="center">
                <Text as="h1" size="lg" weight="semibold">
                  Resource Allocation
                </Text>
              </HStack>
              <HStack gap={2} vAlign="center">
                <Button
                  variant="secondary"
                  size="sm"
                  label="Export"
                  icon={<Download className="size-4" />}
                  isDisabled={!data?.rows?.length}
                  onClick={() =>
                    exportAllocationCsv(sortedData, data?.year ?? new Date().getFullYear())
                  }
                />
              </HStack>
            </HStack>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
          <div className="space-y-4 p-6">
            {error ? (
              <Card className="p-4 text-base text-[color:var(--color-error)]">
                {(error as Error).message}
              </Card>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
                  <Card className="lg:col-span-2 p-4" data-testid="effort-by-account">
                    {isLoading ? (
                      <Skeleton height={140} />
                    ) : effortByAccount.length === 0 ? (
                      <EmptyState
                        icon={<Building2 className="size-6" />}
                        title="No effort in scope"
                        description="No man-months for the current filters."
                      />
                    ) : (
                      <section
                        aria-label="Effort by account breakdown"
                        className="flex items-center gap-4"
                      >
                        {/* Scale the shared DonutChart down — its ring radii are fixed for ~220px. */}
                        <div className="relative h-[112px] w-[112px] shrink-0 overflow-hidden [&_.recharts-tooltip-wrapper]:hidden">
                          <div className="absolute left-1/2 top-1/2 w-[200px] -translate-x-1/2 -translate-y-1/2 scale-[0.56]">
                            <DonutChart
                              slices={effortSlices}
                              height={200}
                              legend="none"
                              centerValue={effortTotalMm}
                            />
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex items-center gap-2">
                            <h3 className="min-w-0 truncate text-base font-semibold text-primary">
                              Effort by account
                            </h3>
                            {effortByAccount.length > EFFORT_DONUT_TOP_N ? (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                label={effortExpanded ? 'Show less' : 'Show all'}
                                onClick={() => setEffortExpanded((v) => !v)}
                              />
                            ) : null}
                            <span className="ml-auto shrink-0 text-sm font-semibold tabular-nums text-primary">
                              TOTAL: {effortTotalMm} MM
                            </span>
                          </div>
                          <ul className="flex flex-col gap-1.5">
                            {effortSlices.map((s) => (
                              <li key={s.key}>
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 text-sm hover:opacity-80"
                                  onClick={() => {
                                    if (s.key === '__other__') {
                                      setEffortExpanded(true);
                                      return;
                                    }
                                    setSearch({ account: s.key, project: undefined });
                                  }}
                                >
                                  <span
                                    aria-hidden="true"
                                    className="size-2.5 shrink-0 rounded-[3px]"
                                    style={{ background: s.color }}
                                  />
                                  <span className="truncate text-primary">{s.name}</span>
                                  <span className="ml-auto font-medium tabular-nums text-primary">
                                    {s.value}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </section>
                    )}
                  </Card>
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
                        label="Search name or employee ID"
                        isLabelHidden
                        className="w-64"
                        size="sm"
                        placeholder="Search name or employee ID…"
                        value={searchInput}
                        onChange={(value) => setSearchInput(value)}
                      />
                      <span className="hidden text-disabled select-none sm:inline">|</span>
                      {activeFiltersCount > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSearchInput('');
                            setSearch({
                              q: undefined,
                              status: undefined,
                              account: undefined,
                              project: undefined,
                              bucket: undefined,
                              crossProject: undefined,
                            });
                          }}
                          icon={<X className="size-3.5" />}
                          label={`Clear filters (${activeFiltersCount})`}
                        />
                      )}
                      <Checkbox
                        label="Cross project"
                        value={!!raw.crossProject}
                        onChange={() =>
                          setSearch({ crossProject: raw.crossProject ? undefined : true })
                        }
                      />
                      <div className="flex items-center gap-2 text-base text-secondary">
                        <span className="flex items-center gap-1 font-medium text-primary">
                          <User className="size-3.5 text-secondary" />
                          {rowCount} {rowCount === 1 ? 'row' : 'rows'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Popover
                        placement="below"
                        alignment="end"
                        label="Toggle columns"
                        content={
                          <div className="flex max-h-80 min-w-[180px] flex-col gap-1 overflow-y-auto p-2">
                            <div className="px-1 pb-1 text-xs font-medium uppercase tracking-[0.04em] text-secondary">
                              Toggle columns
                            </div>
                            {ALLOCATION_COLUMN_OPTIONS.map((col) => {
                              const isToggleable = columnSettingsState.isColumnToggleable(col.key);
                              return (
                                <Checkbox
                                  key={col.key}
                                  label={col.label}
                                  value={columnSettingsState.isColumnActive(col.key)}
                                  isDisabled={!isToggleable}
                                  disabledMessage={
                                    isToggleable ? undefined : 'Always shown — identifies the row'
                                  }
                                  onChange={() => columnSettingsState.toggleColumn(col.key)}
                                />
                              );
                            })}
                          </div>
                        }
                      >
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<Settings2 className="size-3.5" />}
                          label="Columns"
                        />
                      </Popover>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <SegmentedControl
                      label="Allocation status"
                      value={raw.status ?? 'all'}
                      onChange={(v) =>
                        setSearch({
                          status: v === 'all' ? undefined : (v as AllocationStatus),
                        })
                      }
                    >
                      {STATUS_OPTIONS.map((o) => (
                        <SegmentedControlItem key={o.value} value={o.value} label={o.label} />
                      ))}
                    </SegmentedControl>
                    <Typeahead
                      key={`account-${accountItems.map((a) => a.id).join('|')}`}
                      className="h-8 w-44"
                      label="Account"
                      isLabelHidden
                      searchSource={accountSource}
                      debounceMs={0}
                      hasEntriesOnFocus
                      maxMenuItems={Math.max(accountItems.length, 10)}
                      value={accountValue}
                      onChange={(item) =>
                        setSearch({ account: item?.id ?? undefined, project: undefined })
                      }
                      placeholder="All accounts"
                    />
                    <Typeahead
                      key={`project-${projectItems.map((p) => p.id).join('|')}-${raw.account ?? ''}`}
                      className="h-8 w-44"
                      label="Project"
                      isLabelHidden
                      searchSource={projectSource}
                      debounceMs={0}
                      hasEntriesOnFocus
                      maxMenuItems={Math.max(projectItems.length, 10)}
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
                      maxMenuItems={bucketItems.length}
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

                {isLoading ? (
                  <div className="space-y-2">
                    {['s0', 's1', 's2', 's3', 's4'].map((id) => (
                      <Skeleton key={id} height={44} />
                    ))}
                  </div>
                ) : (
                  <Table
                    data={pageRows}
                    columns={columns}
                    density="compact"
                    plugins={{
                      sortable,
                      columnSettings,
                      rowStyling: {
                        transformBodyRow: (props, item) => ({
                          ...props,
                          htmlProps: {
                            ...props.htmlProps,
                            className: cn(
                              props.htmlProps.className,
                              (workerBand.get(item.worker_id) ?? 0) % 2 === 1 && 'bg-card',
                            ),
                            style: { ...props.htmlProps.style, cursor: 'pointer' },
                            onClick: () =>
                              void navigate({
                                to: '/people/employees/$workerId',
                                params: { workerId: item.worker_id },
                              }),
                          },
                        }),
                      },
                    }}
                    emptyState={
                      <EmptyState
                        icon={<BarChart3 className="size-6" />}
                        title="No allocations"
                        description="No one is allocated in your view for this year."
                      />
                    }
                  />
                )}
                {!isLoading && sortedData.length > 0 ? (
                  <div className="flex justify-center">
                    <PaginationFooter
                      page={page}
                      onChange={setPage}
                      totalItems={sortedData.length}
                      pageSize={pageSize}
                      pageSizeOptions={PAGE_SIZE_OPTIONS}
                      onPageSizeChange={(ps) => {
                        setPageSize(ps);
                        setPage(1);
                      }}
                      variant="compact"
                      size="sm"
                      label="Allocation pages"
                    />
                  </div>
                ) : null}
                <p className="text-xs text-secondary">
                  Solid red = that person is over 100% allocated that month.
                </p>
                <UtilizationPanel crossProject={!!raw.crossProject} />
              </>
            )}
          </div>
        </LayoutContent>
      }
    />
  );
}
