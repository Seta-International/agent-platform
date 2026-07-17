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
  SegmentedControl,
  SegmentedControlItem,
  Selector,
  Skeleton,
  Table,
  type TableColumn,
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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Briefcase, Layers, Pause, Search, Settings2, Users } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  fetchOpenRequisitions,
  type OpenRequisitionsBoard,
  type RequisitionListRow,
} from '../api/hiring-client.ts';
import { hiringKeys } from '../state/query-keys.ts';
import { CancelRequisitionDialog } from './cancel-requisition-dialog.tsx';
import { MarkFilledDialog } from './mark-filled-dialog.tsx';
import { NewRequisitionDialog } from './new-requisition-dialog.tsx';
import { RequisitionCard } from './requisition-card.tsx';
import { STAGE_LABEL } from './requisition-format.ts';
import { buildScopeNote } from './utils.ts';

interface CloseTarget {
  id: string;
  version: number;
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  on_hold: 'On hold',
  filled: 'Filled',
  cancelled: 'Cancelled',
};

// Astryx Table columns require `T extends Record<string, unknown>`; the DTO lacks an index
// signature, so alias locally (do not touch the shared DTO).
type Row = RequisitionListRow & Record<string, unknown>;

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
  { key: 'applicants_count', label: 'Applicants' },
  { key: 'status', label: 'Status' },
  { key: 'due_date', label: 'Due' },
];
const DEFAULT_REQ_COLUMN_KEYS = REQ_COLUMN_OPTIONS.map((c) => c.key);
const REQ_PAGE_SIZE_OPTIONS = [25, 50, 100];

export function RequisitionsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canManage = usePermission('hiring.requisition.manage');
  // The "New requisition" button calls openRequisition, which the backend gates on
  // `.open` (see backend/domain/open-requisition.ts) — a distinct permission from `.manage`
  // (edit/hold requisition), even though every seed role grants both today.
  const canCreate = usePermission('hiring.requisition.open');
  // Mark Filled / Cancel call closeRequisition, gated on `.close` — distinct from `.manage`
  // (stage/pause/resume), even though every seed role grants both today.
  const canClose = usePermission('hiring.requisition.close');
  // Lifted out of RequisitionCard (one singleton here instead of one Dialog per card): filling
  // or cancelling removes the row from this board's query, which would unmount the card — and
  // Radix's Dialog can leave `pointer-events` stuck on <body> if it's torn down mid-close-
  // animation. Keeping the dialog mounted at the page level, independent of the row, avoids the
  // race entirely instead of racing a setTimeout against Radix's animation.
  const [fillTarget, setFillTarget] = useState<CloseTarget | null>(null);
  const [cancelTarget, setCancelTarget] = useState<CloseTarget | null>(null);
  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: hiringKeys.requisitions() });
  const [view, setView] = useState<'board' | 'list'>('board');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [kindFilter, setKindFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [activeColumnKeys, setActiveColumnKeys] = useState<string[]>(DEFAULT_REQ_COLUMN_KEYS);

  const { data, isLoading, error } = useQuery<OpenRequisitionsBoard>({
    queryKey: hiringKeys.requisitions(),
    queryFn: fetchOpenRequisitions,
  });
  const rows = data?.requisitions ?? [];
  const scopeNote = buildScopeNote(data);

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
        <div className={`text-display-md font-semibold tabular-nums ${valueClass}`}>{value}</div>
        <div className="mt-1 text-caption text-secondary">{label}</div>
      </div>
    </div>
  );

  const columns = useMemo<TableColumn<Row>[]>(
    () => [
      {
        key: 'title',
        header: 'Position',
        sortable: true,
        renderCell: (r) => (
          <div className="min-w-[240px] max-w-[420px]">
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
        renderCell: (r) => (
          <span className="whitespace-nowrap text-secondary">{r.account_name ?? '—'}</span>
        ),
      },
      {
        key: 'project_name',
        header: 'Project',
        sortable: true,
        renderCell: (r) => (
          <span className="whitespace-nowrap text-secondary">{r.project_name ?? '—'}</span>
        ),
      },
      {
        key: 'grade',
        header: 'Grade',
        sortable: true,
        renderCell: (r) =>
          r.grade ? (
            <div className="max-w-[160px]">
              <Tooltip content={r.grade} hasHoverIndication={false}>
                <div className="truncate text-secondary">{r.grade}</div>
              </Tooltip>
            </div>
          ) : (
            <span className="text-secondary">—</span>
          ),
      },
      {
        key: 'kind',
        header: 'Type',
        sortable: true,
        renderCell: (r) => <span className="text-secondary capitalize">{r.kind}</span>,
      },
      {
        key: 'stage',
        header: 'Stage',
        sortable: true,
        renderCell: (r) => <span className="text-secondary">{STAGE_LABEL[r.stage]}</span>,
      },
      {
        key: 'applicants_count',
        header: 'Applicants',
        sortable: true,
        renderCell: (r) => <span className="text-secondary">{r.applicants_count}</span>,
      },
      {
        key: 'status',
        header: 'Status',
        sortable: true,
        renderCell: (r) => <span className="text-secondary">{STATUS_LABEL[r.status]}</span>,
      },
      {
        key: 'due_date',
        header: 'Due',
        sortable: true,
        renderCell: (r) => (
          <span className="font-mono text-caption text-secondary">{r.due_date ?? '—'}</span>
        ),
      },
    ],
    [],
  );

  // The board only carries non-filled requisitions (status open | on_hold).
  const openCount = rows.filter((r) => r.status === 'open').length;
  const onHold = rows.filter((r) => r.status === 'on_hold').length;
  const totalApplicants = rows.reduce((n, r) => n + r.applicants_count, 0);

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
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {stat(
                'Open positions',
                openCount,
                <Briefcase className="size-5" aria-hidden />,
                'bg-accent-bg/12 text-accent',
              )}
              {stat(
                'Applicants',
                totalApplicants,
                <Users className="size-5" aria-hidden />,
                'bg-success-muted text-success',
              )}
              {stat(
                'On hold',
                onHold,
                <Pause className="size-5" aria-hidden />,
                'bg-warning-muted text-warning',
                'text-warning',
              )}
              {stat(
                'Total open',
                rows.length,
                <Layers className="size-5" aria-hidden />,
                'bg-accent-bg/12 text-accent',
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
                  <SegmentedControlItem value="board" label="Board" />
                  <SegmentedControlItem value="list" label="List" />
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
                        <div className="px-1 pb-1 text-eyebrow uppercase tracking-[0.04em] text-secondary">
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
                  <RequisitionCard
                    key={r.id}
                    r={r}
                    canManage={canManage}
                    canClose={canClose}
                    onRequestMarkFilled={() => setFillTarget({ id: r.id, version: r.version })}
                    onRequestCancel={() => setCancelTarget({ id: r.id, version: r.version })}
                  />
                ))}
              </div>
            )}
          </PageContainer>
          {fillTarget && (
            <MarkFilledDialog
              requisitionId={fillTarget.id}
              version={fillTarget.version}
              open
              onOpenChange={(v) => {
                if (!v) setFillTarget(null);
              }}
              onDone={() => {
                invalidate();
                setFillTarget(null);
              }}
            />
          )}
          {cancelTarget && (
            <CancelRequisitionDialog
              requisitionId={cancelTarget.id}
              version={cancelTarget.version}
              open
              onOpenChange={(v) => {
                if (!v) setCancelTarget(null);
              }}
              onDone={() => {
                invalidate();
                setCancelTarget(null);
              }}
            />
          )}
        </LayoutContent>
      }
    />
  );
}
