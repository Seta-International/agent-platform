import {
  Banner,
  BreadcrumbItem,
  Breadcrumbs,
  Button,
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
  type TablePlugin,
  Text,
  Tooltip,
  useTableColumnSettings,
  useTableColumnSettingsState,
  useTablePagination,
  useTableSortable,
  useTableSortableState,
  VStack,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Briefcase, Layers, LayoutGrid, List, Pause, Search, Settings2, Users } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  fetchOpenRequisitions,
  fetchRequisitions,
  type OpenRequisitionsBoard,
  type RequisitionListRow,
} from '../api/hiring-client.ts';
import { hiringKeys } from '../state/query-keys.ts';
import { NewRequisitionDialog } from './new-requisition-dialog.tsx';
import { RequisitionCard } from './requisition-card.tsx';
import {
  daysLeft,
  furthestReachedIndex,
  PIPELINE_STAGE_LABEL,
  STAGE_LABEL,
  STAGES,
  stageCounts,
} from './requisition-format.ts';
import { buildScopeNote } from './utils.ts';

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  on_hold: 'On hold',
  filled: 'Filled',
  cancelled: 'Cancelled',
};

// Astryx Table columns require `T extends Record<string, unknown>`; the DTO lacks an index
// signature, so alias locally (do not touch the shared DTO).
type Row = RequisitionListRow & Record<string, unknown>;

// Give every row the same minimum height as a wrapped (two-line) row, so single-line
// rows don't sit shorter than ones whose Position/Account text wraps. `height` on a
// `<td>` behaves as a minimum in table layout — rows still grow for taller content.
const uniformRowHeight: TablePlugin<Row> = {
  transformBodyCell: (props) => ({
    ...props,
    htmlProps: {
      ...props.htmlProps,
      style: { ...props.htmlProps.style, height: '2lh' },
    },
  }),
};

// Universe of columns for the column-settings picker. The deleted DataTable never disabled
// `enableColumnVisibility` here (and no column set `enableHiding: false`), so every column —
// including "Position" — was genuinely hideable; preserved as-is (no `isAlwaysVisible`).
const REQ_COLUMN_OPTIONS: ColumnSettingsOption[] = [
  { key: 'title', label: 'Position' },
  { key: 'account_name', label: 'Account' },
  { key: 'project_name', label: 'Project' },
  { key: 'grade', label: 'Grade' },
  { key: 'kind', label: 'Type' },
  { key: 'stage', label: 'Stage' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'applicants_count', label: 'Applicants' },
  { key: 'headcount', label: 'Headcount' },
  { key: 'status', label: 'Status' },
  { key: 'due_date', label: 'Due' },
  { key: 'days_left', label: 'Days left' },
];
const DEFAULT_REQ_COLUMN_KEYS = REQ_COLUMN_OPTIONS.map((c) => c.key);
const REQ_PAGE_SIZE_OPTIONS = [25, 50, 100];

export function RequisitionsPage() {
  const navigate = useNavigate();
  // The "New requisition" button calls openRequisition, which the backend gates on
  // `.open` (see backend/domain/open-requisition.ts) — a distinct permission from `.manage`
  // (edit/hold requisition), even though every seed role grants both today.
  const canCreate = usePermission('hiring.requisition.open');
  const [view, setView] = useState<'board' | 'list'>('board');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [kindFilter, setKindFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [activeColumnKeys, setActiveColumnKeys] = useState<string[]>(DEFAULT_REQ_COLUMN_KEYS);

  const boardQuery = useQuery<OpenRequisitionsBoard>({
    queryKey: hiringKeys.requisitions(),
    queryFn: fetchOpenRequisitions,
    enabled: view === 'board',
  });
  // List view loads ALL requisitions including filled/cancelled (AC3: FUT-325) so the table
  // can show lifecycle terminal states instead of a ghost "Sourcing" column — the board still
  // filters to open/on_hold on the backend.
  const listQuery = useQuery<RequisitionListRow[]>({
    queryKey: hiringKeys.requisitionOptions(),
    queryFn: fetchRequisitions,
    enabled: view === 'list',
  });
  const boardRows = boardQuery.data?.requisitions ?? [];
  const listRows = listQuery.data ?? [];
  const rows = view === 'board' ? boardRows : listRows;
  const scopeNote = buildScopeNote(boardQuery.data);
  const isLoading = view === 'board' ? boardQuery.isLoading : listQuery.isLoading;
  const error = view === 'board' ? boardQuery.error : listQuery.error;

  const accountOptions = useMemo(
    () =>
      Array.from(
        new Set(rows.map((r) => r.account_name).filter((n): n is string => n != null)),
      ).sort(),
    [rows],
  );

  // Scoped to the selected account — a project belongs to exactly one account, so listing every
  // project across all accounts here would let the user pick a combination that never matches.
  const projectOptions = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .filter((r) => accountFilter === 'all' || r.account_name === accountFilter)
            .map((r) => r.project_name)
            .filter((n): n is string => n != null),
        ),
      ).sort(),
    [rows, accountFilter],
  );

  function onAccountFilterChange(next: string) {
    setAccountFilter(next);
    setProjectFilter('all');
  }

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && ![r.title, r.account_name, r.project_name].some((v) => v?.toLowerCase().includes(q)))
        return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (accountFilter !== 'all' && r.account_name !== accountFilter) return false;
      if (projectFilter !== 'all' && r.project_name !== projectFilter) return false;
      if (kindFilter !== 'all' && r.kind !== kindFilter) return false;
      return true;
    });
  }, [rows, query, statusFilter, accountFilter, projectFilter, kindFilter]);

  const { sortedData, sort, sortConfig } = useTableSortableState<Row>({
    data: filteredRows as Row[],
    // Computed columns have no backing field, so sort them explicitly. Days-left sorts by urgency
    // (soonest/overdue first, undated last); headcount by fill ratio (least-filled first).
    comparators: {
      days_left: (a, b) => {
        const av = a.due_date ? daysLeft(a.due_date) : Number.POSITIVE_INFINITY;
        const bv = b.due_date ? daysLeft(b.due_date) : Number.POSITIVE_INFINITY;
        return av - bv;
      },
      headcount: (a, b) => {
        const frac = (r: Row) =>
          r.openings_total > 0 ? (r.openings_total - r.openings_open) / r.openings_total : -1;
        return frac(a) - frac(b);
      },
    },
  });
  const sortable = useTableSortable<Row>(sortConfig);

  // Reset to page 1 on filter/sort change — old TanStack autoResetPageIndex parity (see candidates-page).
  // biome-ignore lint/correctness/useExhaustiveDependencies: the filters and sort are the intentional reset triggers, unread in the body.
  useEffect(() => {
    setPage(1);
  }, [query, statusFilter, accountFilter, projectFilter, kindFilter, sort]);

  const pageRows = useMemo(
    () => paginateData(sortedData, page, pageSize),
    [sortedData, page, pageSize],
  );
  const pagination = useTablePagination<Row>({
    page,
    onPageChange: setPage,
    totalItems: sortedData.length,
    pageSize,
    onPageSizeChange: (ps) => {
      setPageSize(ps);
      setPage(1);
    },
    pageSizeOptions: REQ_PAGE_SIZE_OPTIONS,
  });

  const columnSettingsState = useTableColumnSettingsState({
    columns: REQ_COLUMN_OPTIONS,
    activeColumnKeys,
    onChangeActiveColumnKeys: (keys) => setActiveColumnKeys([...keys]),
  });
  const columnSettings = useTableColumnSettings<Row>(columnSettingsState.columnSettingsConfig);

  const stat = (
    label: string,
    value: number,
    icon: ReactNode,
    iconClass: string,
    valueClass = 'text-primary',
  ) => (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-card px-5 py-4">
      <div
        className={`flex size-11 shrink-0 items-center justify-center rounded-full ${iconClass}`}
      >
        {icon}
      </div>
      <div>
        <div className={`text-5xl font-semibold tabular-nums ${valueClass}`}>{value}</div>
        <div className="mt-1 text-sm text-secondary">{label}</div>
      </div>
    </div>
  );

  const columns = useMemo<TableColumn<Row>[]>(
    () => [
      {
        key: 'title',
        header: 'Position',
        sortable: true,
        width: proportional(2, { minWidth: 240 }),
        renderCell: (r) => (
          <div className="max-w-[420px]">
            <Tooltip content={r.title} hasHoverIndication={false}>
              <div className="line-clamp-2 break-words font-medium text-primary">{r.title}</div>
            </Tooltip>
          </div>
        ),
      },
      {
        key: 'account_name',
        header: 'Account',
        sortable: true,
        width: proportional(1, { minWidth: 160 }),
        renderCell: (r) => (
          <span className="break-words text-secondary">{r.account_name ?? '—'}</span>
        ),
      },
      {
        key: 'project_name',
        header: 'Project',
        sortable: true,
        width: proportional(1, { minWidth: 150 }),
        renderCell: (r) => (
          <span className="break-words text-secondary">{r.project_name ?? '—'}</span>
        ),
      },
      {
        key: 'grade',
        header: 'Grade',
        sortable: true,
        width: pixel(120),
        renderCell: (r) =>
          r.grade ? (
            <Tooltip content={r.grade} hasHoverIndication={false}>
              <div className="truncate text-secondary">{r.grade}</div>
            </Tooltip>
          ) : (
            <span className="text-secondary">—</span>
          ),
      },
      {
        key: 'kind',
        header: 'Type',
        sortable: true,
        width: pixel(96),
        renderCell: (r) => <span className="text-secondary capitalize">{r.kind}</span>,
      },
      {
        key: 'stage',
        header: 'Stage',
        sortable: true,
        width: pixel(120),
        // AC3 (FUT-325): for non-open statuses show the lifecycle word instead of the
        // pipeline stage — On hold / Filled / Cancelled, not Sourcing.
        renderCell: (r) => (
          <span className="text-secondary">
            {r.status !== 'open' ? STATUS_LABEL[r.status] : STAGE_LABEL[r.stage]}
          </span>
        ),
      },
      {
        // Compact per-stage breakdown (New · Screening · Interview · Offer), the deepest reached
        // stage emphasised — the card's mini-pipeline as one cell. Tooltip spells out the stages.
        key: 'pipeline',
        header: 'Pipeline',
        sortable: false,
        width: pixel(160),
        renderCell: (r) => {
          const counts = stageCounts(r.applicants_count, r.applicants);
          const furthest = furthestReachedIndex(r.applicants);
          const hired = r.hired_count;
          const tooltip = `${STAGES.map((s, i) => `${PIPELINE_STAGE_LABEL[s]} ${counts[i]}`).join(
            ' · ',
          )} · Hired ${hired}`;
          return (
            <Tooltip content={tooltip} hasHoverIndication={false}>
              <span className="flex items-center gap-1 whitespace-nowrap tabular-nums">
                {counts.map((c, i) => (
                  <span key={STAGES[i]} className="flex items-center gap-1">
                    {i > 0 && <span className="text-secondary">·</span>}
                    <span
                      className={i === furthest ? 'font-semibold text-primary' : 'text-secondary'}
                    >
                      {c}
                    </span>
                  </span>
                ))}
                {/* Hired is a status, not a stage — set it off with an em dash so it reads as a
                    separate figure rather than a 5th funnel bucket. */}
                <span className="text-secondary">—</span>
                <span className={hired > 0 ? 'font-semibold text-primary' : 'text-secondary'}>
                  {hired}
                </span>
              </span>
            </Tooltip>
          );
        },
      },
      {
        key: 'applicants_count',
        header: 'Applicants',
        sortable: true,
        width: pixel(110),
        renderCell: (r) => <span className="text-secondary">{r.applicants_count}</span>,
      },
      {
        // Fill progress (filled / total openings) — how close the requisition is to being filled.
        key: 'headcount',
        header: 'Headcount',
        sortable: true,
        width: pixel(120),
        renderCell: (r) =>
          r.openings_total > 0 ? (
            <span className="whitespace-nowrap tabular-nums text-secondary">
              {Math.max(0, r.openings_total - r.openings_open)}/{r.openings_total} filled
            </span>
          ) : (
            <span className="text-secondary">—</span>
          ),
      },
      {
        key: 'status',
        header: 'Status',
        sortable: true,
        width: pixel(100),
        renderCell: (r) => <span className="text-secondary">{STATUS_LABEL[r.status]}</span>,
      },
      {
        key: 'due_date',
        header: 'Due',
        sortable: true,
        width: pixel(120),
        renderCell: (r) => (
          <span className="font-mono text-sm text-secondary">{r.due_date ?? '—'}</span>
        ),
      },
      {
        // Urgency countdown, coloured only when it needs attention (overdue → red, ≤7 days → amber);
        // matches the requisition card's time-to-fill signal.
        key: 'days_left',
        header: 'Days left',
        sortable: true,
        width: pixel(140),
        renderCell: (r) => {
          if (!r.due_date) return <span className="text-secondary">—</span>;
          const dl = daysLeft(r.due_date);
          const label =
            dl < 0
              ? `${-dl} day${dl === -1 ? '' : 's'} overdue`
              : dl === 0
                ? 'Due today'
                : `${dl} day${dl === 1 ? '' : 's'} left`;
          const color =
            dl > 7 ? undefined : dl < 0 ? 'var(--color-text-error)' : 'var(--color-text-warning)';
          return (
            <span
              className="whitespace-nowrap text-secondary"
              style={color ? { color } : undefined}
            >
              {label}
            </span>
          );
        },
      },
    ],
    [],
  );

  // The board only carries non-filled requisitions (status open | on_hold). Stats follow the
  // active search/filters so the tiles describe what the user is looking at, not the whole board.
  const openCount = filteredRows.filter((r) => r.status === 'open').length;
  const onHold = filteredRows.filter((r) => r.status === 'on_hold').length;
  const totalApplicants = filteredRows.reduce((n, r) => n + r.applicants_count, 0);

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={1}>
            <Breadcrumbs variant="supporting">
              <BreadcrumbItem href="/hiring">Hiring Management</BreadcrumbItem>
              <BreadcrumbItem isCurrent>Requisitions</BreadcrumbItem>
            </Breadcrumbs>
            <HStack hAlign="between" vAlign="center" gap={2}>
              <HStack gap={2} vAlign="center">
                <Text as="h1" size="lg" weight="semibold">
                  Requisitions
                </Text>
                <Text color="secondary">
                  Live open positions across every account — track hiring status and let internal
                  staff browse and apply.
                </Text>
              </HStack>
              <NewRequisitionDialog disabled={!canCreate} />
            </HStack>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
          <PageContainer className="space-y-4">
            {scopeNote && <Banner status="info" title={scopeNote} />}
            {/* One accent only (DESIGN.md): neutral icon chips + ink numbers — the counts carry
                the weight, colour stays reserved for status pills and the primary CTA. */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {stat(
                'Open positions',
                openCount,
                <Briefcase className="size-5" aria-hidden />,
                'bg-surface text-secondary',
              )}
              {stat(
                'Applicants',
                totalApplicants,
                <Users className="size-5" aria-hidden />,
                'bg-surface text-secondary',
              )}
              {stat(
                'On hold',
                onHold,
                <Pause className="size-5" aria-hidden />,
                'bg-surface text-secondary',
              )}
              {stat(
                // Counts every status shown (open, on hold, filled…), not just open — and follows
                // the active filters like the other tiles, so it matches what's on screen (FUT-765).
                'Total',
                filteredRows.length,
                <Layers className="size-5" aria-hidden />,
                'bg-surface text-secondary',
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Input
                label="Search requisitions"
                isLabelHidden
                startIcon={<Search className="size-3.5" aria-hidden />}
                placeholder="Search requisitions…"
                value={query}
                onChange={(value) => setQuery(value)}
                className="min-w-[220px] max-w-sm flex-1"
              />
              {/* Filters cluster — grouped tighter (gap-2) than the gap-3 that separates this
              cluster from the search box and the view toggle, so proximity signals the
              relationship: search finds, filters narrow, toggle changes layout. */}
              <div className="flex flex-wrap items-center gap-2">
                <Selector
                  label="Filter by status"
                  isLabelHidden
                  options={[
                    { value: 'all', label: 'Status' },
                    { value: 'open', label: 'Open' },
                    { value: 'on_hold', label: 'On hold' },
                    { value: 'filled', label: 'Filled' },
                    { value: 'cancelled', label: 'Cancelled' },
                  ]}
                  value={statusFilter}
                  onChange={setStatusFilter}
                />
                <Selector
                  label="Filter by account"
                  isLabelHidden
                  options={[
                    { value: 'all', label: 'Account' },
                    ...accountOptions.map((a) => ({ value: a, label: a })),
                  ]}
                  value={accountFilter}
                  onChange={onAccountFilterChange}
                />
                <Selector
                  label="Filter by project"
                  isLabelHidden
                  options={[
                    { value: 'all', label: 'Project' },
                    ...projectOptions.map((p) => ({ value: p, label: p })),
                  ]}
                  value={projectFilter}
                  onChange={setProjectFilter}
                  isDisabled={accountFilter === 'all'}
                  placeholder="Project"
                />
                <Selector
                  label="Filter by type"
                  isLabelHidden
                  options={[
                    { value: 'all', label: 'More filters' },
                    { value: 'new', label: 'New' },
                    { value: 'replacement', label: 'Replacement' },
                  ]}
                  value={kindFilter}
                  onChange={setKindFilter}
                />
              </div>
              <div className="ml-auto">
                <SegmentedControl
                  label="Requisitions view"
                  value={view}
                  onChange={(v) => setView(v as 'board' | 'list')}
                >
                  <SegmentedControlItem
                    value="board"
                    label="Board"
                    icon={<LayoutGrid aria-hidden="true" />}
                  />
                  <SegmentedControlItem
                    value="list"
                    label="List"
                    icon={<List aria-hidden="true" />}
                  />
                </SegmentedControl>
              </div>
            </div>
            {error ? (
              <Banner status="error" title={(error as Error).message} />
            ) : view === 'list' ? (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <Popover
                    placement="below"
                    alignment="end"
                    label="Toggle columns"
                    content={
                      <div className="flex max-h-80 min-w-[180px] flex-col gap-1 overflow-y-auto p-2">
                        <div className="px-1 pb-1 text-xs font-medium uppercase tracking-[0.04em] text-secondary">
                          Toggle columns
                        </div>
                        {REQ_COLUMN_OPTIONS.map((col) => (
                          <Checkbox
                            key={col.key}
                            label={col.label}
                            value={columnSettingsState.isColumnActive(col.key)}
                            onChange={() => columnSettingsState.toggleColumn(col.key)}
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
                    data={pageRows}
                    columns={columns}
                    idKey="id"
                    plugins={{
                      pagination,
                      sortable,
                      columnSettings,
                      uniformRowHeight,
                      rowClick: {
                        transformBodyRow: (props, item) => ({
                          ...props,
                          htmlProps: {
                            ...props.htmlProps,
                            style: { ...props.htmlProps.style, cursor: 'pointer' },
                            onClick: () =>
                              void navigate({
                                to: '/hiring/requisitions',
                                search: (prev: Record<string, unknown>) => ({
                                  ...prev,
                                  selectedRequisitionId: item.id,
                                }),
                              }),
                          },
                        }),
                      },
                    }}
                    emptyState={
                      <EmptyState
                        icon={<Briefcase className="size-6" />}
                        title={
                          rows.length === 0 ? 'No requisitions yet' : 'No matching requisitions'
                        }
                        description={
                          rows.length === 0
                            ? 'Open a requisition to get started.'
                            : 'Try different filters.'
                        }
                      />
                    }
                  />
                )}
              </div>
            ) : isLoading ? (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-40 animate-pulse rounded-lg border border-border bg-surface"
                  />
                ))}
              </div>
            ) : filteredRows.length === 0 ? (
              <EmptyState
                icon={<Briefcase className="size-6" />}
                title={rows.length === 0 ? 'No requisitions yet' : 'No matching requisitions'}
                description={
                  rows.length === 0
                    ? 'Open a requisition to get started.'
                    : 'Try different filters.'
                }
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {filteredRows.map((r) => (
                  <RequisitionCard key={r.id} r={r} />
                ))}
              </div>
            )}
          </PageContainer>
        </LayoutContent>
      }
    />
  );
}
