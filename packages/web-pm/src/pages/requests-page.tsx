import { usePermission } from '@seta/web-identity';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  FileText,
  Gavel,
  type LucideIcon,
  Settings2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type CharterListQuery,
  type CharterListRow,
  type CharterStatus,
  fetchAccounts,
  fetchCharterSummary,
  fetchCharters,
} from '../api/pm-client.ts';
import { useWorkerSource } from '../api/worker-search';
import { pmKeys } from '../state/query-keys.ts';
import {
  Badge,
  Banner,
  BreadcrumbItem,
  Breadcrumbs,
  Button,
  Card,
  Checkbox,
  type ColumnSettingsOption,
  EmptyState,
  HStack,
  Input,
  Layout,
  LayoutContent,
  LayoutHeader,
  PageContainer,
  Popover,
  paginateData,
  pixel,
  proportional,
  SegmentedControl,
  SegmentedControlItem,
  Selector,
  Skeleton,
  Table,
  type TableColumn,
  Text,
  useSeededItems,
  useTableColumnSettings,
  useTableColumnSettingsState,
  useTablePagination,
  useTableSortable,
  useTableSortableState,
  VStack,
} from './_ui-compat.tsx';
import { CharterStepper } from './charter-stepper.tsx';
import { SubmitCharterDialog } from './submit-charter-dialog.tsx';

export interface RequestsSearch {
  view?: 'cards' | 'table';
  status?: CharterStatus;
  account?: string;
  q?: string;
  sort?: NonNullable<CharterListQuery['sort']>;
  dir?: NonNullable<CharterListQuery['dir']>;
  page?: number;
}

const PAGE_SIZE = 25;

// Astryx Table columns require `T extends Record<string, unknown>`; the DTO
// lacks an index signature, so alias locally (do not touch the shared DTO).
type RequestRow = CharterListRow & Record<string, unknown>;

// The deleted DataTable's own client-side filter/sort/pagination operated on
// whatever `data` it was given — here, the already server-paginated (≤25-row)
// `rows` for the current outer page. It was never disabled
// (`enableGlobalFilter`/`enableColumnVisibility` default `true`; no
// `pagination={false}`), so this table-view render had its own inner
// search/columns/pager stacked on top of the page's own server-driven
// search/sort/pager below. Preserved as-is per the parity gate — flagged in
// the task report as a candidate for a follow-up simplification, not silently
// dropped here.
const TABLE_PAGE_SIZE = 25;
const TABLE_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const TABLE_COLUMN_OPTIONS: ColumnSettingsOption[] = [
  { key: 'name', label: 'Project' },
  { key: 'account', label: 'Account' },
  { key: 'pm', label: 'PM' },
  { key: 'budget', label: 'Budget' },
  { key: 'status', label: 'Status' },
  { key: 'submitted', label: 'Submitted' },
];
const DEFAULT_TABLE_COLUMN_KEYS = TABLE_COLUMN_OPTIONS.map((c) => c.key);

const STATUS_META: Record<
  CharterListRow['status'],
  { label: string; variant: 'neutral' | 'success' | 'error' }
> = {
  submitted: { label: 'Awaiting PMO review', variant: 'neutral' },
  pmo_approved: { label: 'Awaiting BoD review', variant: 'neutral' },
  approved: { label: 'Approved · created', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'error' },
  withdrawn: { label: 'Withdrawn', variant: 'neutral' },
};

const STATUS_OPTIONS: ReadonlyArray<{ value: CharterStatus; label: string }> = [
  { value: 'submitted', label: 'Awaiting PMO' },
  { value: 'pmo_approved', label: 'Awaiting BoD' },
  { value: 'approved', label: 'Approved · created' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

const SORT_OPTIONS: ReadonlyArray<{ value: NonNullable<RequestsSearch['sort']>; label: string }> = [
  { value: 'submitted', label: 'Submitted date' },
  { value: 'name', label: 'Project name' },
  { value: 'budget', label: 'Budget (BMM)' },
  { value: 'team', label: 'Team size' },
];

const METHODOLOGY_LABEL: Record<string, string> = { scrum: 'Scrum', kanban: 'Kanban' };
const PRICING_LABEL: Record<string, string> = { fixed_price: 'Fixed-price', time_materials: 'T&M' };

function Kpi({
  label,
  value,
  sub,
  tone,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'warning' | 'positive';
  icon: LucideIcon;
  active?: boolean;
  onClick?: () => void;
}) {
  const color =
    tone === 'warning'
      ? 'var(--color-warning)'
      : tone === 'positive'
        ? 'var(--color-success)'
        : 'var(--color-text-secondary)';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="text-left transition-transform enabled:hover:-translate-y-px"
    >
      <Card
        className={[
          'h-full transition-shadow flex items-center justify-between gap-3 p-3.5',
          active ? 'border-blue ring-1 ring-blue/30' : '',
          onClick ? 'enabled:hover:shadow-sm hover:border-blue/40' : '',
        ].join(' ')}
      >
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-secondary">{label}</div>
          <div className="mt-1 text-2xl font-semibold leading-none tabular-nums" style={{ color }}>
            {value}
          </div>
          {sub && <div className="mt-1.5 text-xs text-secondary">{sub}</div>}
        </div>
        <span
          className="grid size-9 flex-shrink-0 place-items-center rounded-[10px]"
          style={{
            background: `color-mix(in srgb, ${color} 12%, transparent)`,
            color,
          }}
        >
          <Icon className="size-[18px]" />
        </span>
      </Card>
    </button>
  );
}

const STATUS_ACCENT: Record<CharterListRow['status'], string> = {
  submitted: 'var(--color-warning)',
  pmo_approved: 'var(--color-warning)',
  approved: 'var(--color-success)',
  rejected: 'var(--color-error)',
  withdrawn: 'var(--color-border)',
};

function RequestCard({
  row,
  accountName,
  pmName,
  onOpen,
}: {
  row: CharterListRow;
  accountName: string;
  pmName: string;
  onOpen: () => void;
}) {
  const meta = [
    `PM ${pmName}`,
    row.budget_bmm != null && Number(row.budget_bmm) > 0 ? `${Number(row.budget_bmm)} BMM` : null,
    row.team_size != null ? `Team ${row.team_size}` : null,
    row.methodology ? METHODOLOGY_LABEL[row.methodology] : null,
    row.pricing_model ? PRICING_LABEL[row.pricing_model] : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const status = STATUS_META[row.status];
  return (
    <button type="button" onClick={onOpen} className="group block w-full text-left">
      <Card
        className="overflow-hidden border-l-[3px] transition-shadow hover:border-blue/40 hover:shadow-sm space-y-3 p-4"
        style={{ borderLeftColor: STATUS_ACCENT[row.status] }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-secondary">
                #{row.charter_id.slice(0, 8)}
              </span>
              <Badge variant={status.variant} label={status.label} />
              <span className="rounded bg-surface px-1.5 py-0.5 text-xs font-medium text-secondary">
                {accountName}
              </span>
            </div>
            <div className="mt-1.5 truncate text-base font-semibold text-primary">{row.name}</div>
            <div className="mt-0.5 truncate text-base text-secondary">{meta}</div>
          </div>
          <div className="flex flex-shrink-0 items-start gap-2">
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-secondary">Submitted</div>
              <div className="font-mono text-base font-semibold text-primary">
                {row.created_at.slice(0, 10)}
              </div>
            </div>
            <ChevronRight className="mt-0.5 size-4 text-secondary opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        </div>
        <div className="border-t border-border pt-3">
          <CharterStepper
            status={row.status}
            rejectedStage={row.rejected_stage}
            variant="compact"
          />
        </div>
      </Card>
    </button>
  );
}

export function RequestsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canSubmit = usePermission('pm.charter.submit');
  const search = useSearch({ strict: false }) as Partial<RequestsSearch>;
  const view = search.view ?? 'cards';
  const status = search.status;
  const account = search.account;
  const q = search.q;
  const sort = search.sort ?? 'submitted';
  const dir = search.dir ?? 'desc';
  const page = search.page ?? 1;

  const update = useCallback(
    (patch: Partial<RequestsSearch>, resetPage = true) => {
      const next: Partial<RequestsSearch> = { ...search, ...patch };
      if (resetPage && !('page' in patch)) next.page = 1;
      void navigate({ to: '/pm/requests', search: next, replace: true });
    },
    [navigate, search],
  );

  // Debounced free-text search synced to the URL.
  const [searchInput, setSearchInput] = useState(q ?? '');
  const [isComposing, setIsComposing] = useState(false);
  const lastCommittedQ = useRef(q);

  // Sync external URL changes into local searchInput (e.g. back/forward, external filter reset)
  useEffect(() => {
    if (isComposing) return;
    if (q !== lastCommittedQ.current) {
      lastCommittedQ.current = q;
      setSearchInput(q ?? '');
    }
  }, [q, isComposing]);

  useEffect(() => {
    if (isComposing) return;
    const trimmed = searchInput.trim();
    const nextQ = trimmed || undefined;
    if (nextQ === (q ?? undefined)) return;
    const id = setTimeout(() => {
      lastCommittedQ.current = nextQ;
      update({ q: nextQ });
    }, 250);
    return () => clearTimeout(id);
  }, [searchInput, q, isComposing, update]);

  const params: CharterListQuery = {
    status,
    account_id: account,
    q,
    sort,
    dir,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  };

  const { data, isLoading, error } = useQuery({
    queryKey: pmKeys.chartersList(params as Record<string, unknown>),
    queryFn: () => fetchCharters(params),
  });
  const { data: summary } = useQuery({
    queryKey: pmKeys.charterSummary(),
    queryFn: fetchCharterSummary,
  });
  const { data: accounts } = useQuery({ queryKey: pmKeys.accounts(), queryFn: fetchAccounts });

  const rows = useMemo(() => data?.charters ?? [], [data]);
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const accountName = useMemo(() => {
    const m = new Map((accounts ?? []).map((a) => [a.account_id, a.name]));
    return (id: string) => m.get(id) ?? id.slice(0, 8);
  }, [accounts]);

  const workerSource = useWorkerSource();
  const pmIds = useMemo(
    () => [...new Set(rows.map((r) => r.pm_worker_id).filter((id): id is string => !!id))],
    [rows],
  );
  const [resolvedPms] = useSeededItems(pmIds, workerSource.seed);
  const pmName = useMemo(() => {
    const m = new Map(resolvedPms.map((o) => [o.id, o.label]));
    return (id: string | null) => (id ? (m.get(id) ?? id.slice(0, 8)) : '—');
  }, [resolvedPms]);

  const open = (charterId: string) =>
    void navigate({ to: '/pm/requests/$charterId', params: { charterId } });

  // Inner table-view controls (search/columns/pager) — see the block comment
  // above `TABLE_PAGE_SIZE`: these operate on the current server page's rows,
  // distinct from the outer `search`/`page` URL state above.
  const [tableSearch, setTableSearch] = useState('');
  const [tablePage, setTablePage] = useState(1);
  const [tablePageSize, setTablePageSize] = useState(TABLE_PAGE_SIZE);
  const [tableActiveColumnKeys, setTableActiveColumnKeys] =
    useState<string[]>(DEFAULT_TABLE_COLUMN_KEYS);

  const tableRows = rows as RequestRow[];
  // The deleted DataTable's global filter matched accessor-backed columns
  // only (`name`, `status`) — `account`/`pm`/`budget`/`submitted` had no
  // accessor (render-only `cell`), so were never part of the filtered value
  // set even though their cells display derived text.
  const tableFiltered = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    if (!q) return tableRows;
    return tableRows.filter((r) =>
      [r.name, r.status].some((v) => (v ?? '').toLowerCase().includes(q)),
    );
  }, [tableRows, tableSearch]);

  const {
    sortedData: tableSorted,
    sort: tableSort,
    sortConfig: tableSortConfig,
  } = useTableSortableState<RequestRow>({ data: tableFiltered });
  const tableSortable = useTableSortable<RequestRow>(tableSortConfig);

  // Reset the inner table's page to 1 on sort change — old TanStack autoResetPageIndex parity (see candidates-page).
  // The inner search box already resets `tablePage` inline in its own onChange handler below.
  // biome-ignore lint/correctness/useExhaustiveDependencies: tableSort is the intentional reset trigger, unread in the body.
  useEffect(() => {
    setTablePage(1);
  }, [tableSort]);

  const tablePageRows = useMemo(
    () => paginateData(tableSorted, tablePage, tablePageSize),
    [tableSorted, tablePage, tablePageSize],
  );
  const tablePagination = useTablePagination<RequestRow>({
    page: tablePage,
    onPageChange: setTablePage,
    totalItems: tableSorted.length,
    pageSize: tablePageSize,
    onPageSizeChange: (ps) => {
      setTablePageSize(ps);
      setTablePage(1);
    },
    pageSizeOptions: TABLE_PAGE_SIZE_OPTIONS,
  });

  const tableColumnSettingsState = useTableColumnSettingsState({
    columns: TABLE_COLUMN_OPTIONS,
    activeColumnKeys: tableActiveColumnKeys,
    onChangeActiveColumnKeys: (keys) => setTableActiveColumnKeys([...keys]),
  });
  const tableColumnSettings = useTableColumnSettings<RequestRow>(
    tableColumnSettingsState.columnSettingsConfig,
  );

  const columns = useMemo<TableColumn<RequestRow>[]>(
    () => [
      {
        key: 'name',
        header: 'Project',
        width: proportional(2),
        sortable: true,
        renderCell: (r) => <span className="font-medium text-primary">{r.name}</span>,
      },
      {
        key: 'account',
        header: 'Account',
        width: proportional(1),
        renderCell: (r) => <span className="text-secondary">{accountName(r.account_id)}</span>,
      },
      {
        key: 'pm',
        header: 'PM',
        width: proportional(1),
        renderCell: (r) => <span className="text-secondary">{pmName(r.pm_worker_id)}</span>,
      },
      {
        key: 'budget',
        header: 'Budget',
        width: pixel(110),
        renderCell: (r) => (
          <span className="font-mono text-sm text-secondary">
            {r.budget_bmm != null ? `${Number(r.budget_bmm)} BMM` : '—'}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        width: pixel(150),
        sortable: true,
        renderCell: (r) => {
          const meta = STATUS_META[r.status];
          return <Badge variant={meta.variant} label={meta.label} />;
        },
      },
      {
        key: 'submitted',
        header: 'Submitted',
        width: pixel(110),
        renderCell: (r) => (
          <span className="font-mono text-sm text-secondary">{r.created_at.slice(0, 10)}</span>
        ),
      },
    ],
    [accountName, pmName],
  );

  const actions = canSubmit ? (
    <SubmitCharterDialog
      onCreated={() => void queryClient.invalidateQueries({ queryKey: pmKeys.charters() })}
    />
  ) : undefined;

  const filtered = status != null || account != null || (q ?? '') !== '';

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={1}>
            <Breadcrumbs variant="supporting">
              <BreadcrumbItem href="/pm">Project Monitoring</BreadcrumbItem>
              <BreadcrumbItem isCurrent>Project Requests</BreadcrumbItem>
            </Breadcrumbs>
            <HStack hAlign="between" vAlign="center" gap={2}>
              <HStack gap={2} vAlign="center">
                <Text as="h1" size="lg" weight="semibold">
                  Project Requests
                </Text>
                <Text color="secondary">
                  Project Monitoring · Governance — a PM submits a charter → PMO sign-off → BoD
                  approval → the project is created in the portfolio → staffing & access (R&R) is
                  granted per person.
                </Text>
              </HStack>
              {actions}
            </HStack>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
          <PageContainer className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Kpi label="Total requests" value={String(summary?.total ?? 0)} icon={FileText} />
              <Kpi
                label="Awaiting PMO"
                value={String(summary?.submitted ?? 0)}
                sub="PMO sign-off required"
                tone="warning"
                icon={Clock}
                active={status === 'submitted'}
                onClick={() => update({ status: status === 'submitted' ? undefined : 'submitted' })}
              />
              <Kpi
                label="Awaiting BoD"
                value={String(summary?.pmo_approved ?? 0)}
                sub="Board approval required"
                tone="warning"
                icon={Gavel}
                active={status === 'pmo_approved'}
                onClick={() =>
                  update({ status: status === 'pmo_approved' ? undefined : 'pmo_approved' })
                }
              />
              <Kpi
                label="Approved · created"
                value={String(summary?.approved ?? 0)}
                sub={`${summary?.rejected ?? 0} rejected`}
                tone="positive"
                icon={CheckCircle2}
                active={status === 'approved'}
                onClick={() => update({ status: status === 'approved' ? undefined : 'approved' })}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Selector
                label="Filter by status"
                isLabelHidden
                options={[
                  { value: 'all', label: 'All statuses' },
                  ...STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
                ]}
                value={status ?? 'all'}
                onChange={(v) => update({ status: v === 'all' ? undefined : (v as CharterStatus) })}
                placeholder="Status"
              />

              <Selector
                label="Filter by account"
                isLabelHidden
                options={[
                  { value: 'all', label: 'All accounts' },
                  ...(accounts ?? []).map((a) => ({ value: a.account_id, label: a.name })),
                ]}
                value={account ?? 'all'}
                onChange={(v) => update({ account: v === 'all' ? undefined : v })}
                placeholder="Account"
              />

              <Input
                label="Search project name"
                isLabelHidden
                value={searchInput}
                onChange={(value) => {
                  setSearchInput(value);
                  if (value === '') {
                    lastCommittedQ.current = undefined;
                    update({ q: undefined });
                  }
                }}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={(e) => {
                  setIsComposing(false);
                  const val = (e.currentTarget as HTMLInputElement).value;
                  setSearchInput(val);
                }}
                placeholder="Search project name…"
                className="w-[220px]"
              />

              <div className="ml-auto flex items-center gap-2">
                <Selector
                  label="Sort by"
                  isLabelHidden
                  options={SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                  value={sort}
                  onChange={(v) => update({ sort: v as RequestsSearch['sort'] })}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  isIconOnly
                  label={dir === 'asc' ? 'Ascending' : 'Descending'}
                  onClick={() => update({ dir: dir === 'asc' ? 'desc' : 'asc' })}
                  icon={
                    dir === 'asc' ? (
                      <ArrowUp className="size-4" />
                    ) : (
                      <ArrowDown className="size-4" />
                    )
                  }
                />
                <SegmentedControl
                  label="Requests view"
                  value={view}
                  onChange={(v) => update({ view: v as 'cards' | 'table' }, false)}
                >
                  <SegmentedControlItem value="cards" label="Cards" />
                  <SegmentedControlItem value="table" label="Table" />
                </SegmentedControl>
              </div>
            </div>

            {error ? (
              <Banner status="error" title={(error as Error).message} />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={<ClipboardList className="size-6" />}
                title={filtered ? 'No requests match these filters' : 'No requests yet'}
                description={
                  filtered
                    ? 'Try clearing the status, account, or search filters.'
                    : 'Submit a project charter to get started.'
                }
                actions={
                  filtered ? (
                    <Button
                      label="Clear filters"
                      onClick={() =>
                        update({ status: undefined, account: undefined, q: undefined })
                      }
                    />
                  ) : undefined
                }
              />
            ) : view === 'table' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Input
                    label="Search this page"
                    isLabelHidden
                    className="max-w-sm"
                    placeholder="Search…"
                    value={tableSearch}
                    onChange={(value) => {
                      setTableSearch(value);
                      setTablePage(1);
                    }}
                  />
                  <Popover
                    placement="below"
                    alignment="end"
                    label="Toggle columns"
                    content={
                      <div className="flex min-w-[180px] flex-col gap-1 p-2">
                        <div className="px-1 pb-1 text-xs font-medium uppercase tracking-[0.04em] text-secondary">
                          Toggle columns
                        </div>
                        {TABLE_COLUMN_OPTIONS.map((col) => (
                          <Checkbox
                            key={col.key}
                            label={col.label}
                            value={tableColumnSettingsState.isColumnActive(col.key)}
                            onChange={() => tableColumnSettingsState.toggleColumn(col.key)}
                          />
                        ))}
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
                {isLoading ? (
                  <div className="space-y-2">
                    {['s0', 's1', 's2', 's3', 's4'].map((id) => (
                      <Skeleton key={id} height={40} />
                    ))}
                  </div>
                ) : (
                  <Table
                    data={tablePageRows}
                    columns={columns}
                    idKey="charter_id"
                    plugins={{
                      pagination: tablePagination,
                      sortable: tableSortable,
                      columnSettings: tableColumnSettings,
                      rowClick: {
                        transformBodyRow: (props, item) => ({
                          ...props,
                          htmlProps: {
                            ...props.htmlProps,
                            style: { ...props.htmlProps.style, cursor: 'pointer' },
                            onClick: () => open(item.charter_id),
                          },
                        }),
                      },
                    }}
                    emptyState={
                      tableSearch.trim() ? (
                        <EmptyState
                          title="No results match these filters"
                          description="Try removing a filter or clearing your search."
                          actions={
                            <Button label="Clear filters" onClick={() => setTableSearch('')} />
                          }
                        />
                      ) : undefined
                    }
                  />
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {rows.map((r) => (
                  <RequestCard
                    key={r.charter_id}
                    row={r}
                    accountName={accountName(r.account_id)}
                    pmName={pmName(r.pm_worker_id)}
                    onOpen={() => open(r.charter_id)}
                  />
                ))}
              </div>
            )}

            {pageCount > 1 && (
              <div className="flex items-center justify-end gap-3">
                <span className="text-sm text-secondary">
                  Page {page} of {pageCount} · {total} total
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  isIconOnly
                  label="Previous page"
                  isDisabled={page <= 1}
                  onClick={() => update({ page: page - 1 }, false)}
                  icon={<ChevronLeft className="size-4" />}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  isIconOnly
                  label="Next page"
                  isDisabled={page >= pageCount}
                  onClick={() => update({ page: page + 1 }, false)}
                  icon={<ChevronRight className="size-4" />}
                />
              </div>
            )}
          </PageContainer>
        </LayoutContent>
      }
    />
  );
}
