import {
  Avatar,
  Badge,
  Banner,
  BreadcrumbItem,
  Breadcrumbs,
  Button,
  Checkbox,
  type ColumnSettingsOption,
  CounterBadgePopover,
  EmptyState,
  HStack,
  Input,
  Layout,
  LayoutContent,
  LayoutHeader,
  Popover,
  pixel,
  proportional,
  SegmentedControl,
  SegmentedControlItem,
  Skeleton,
  Table,
  type TableColumn,
  type TableSortState,
  Text,
  useTableColumnSettings,
  useTableColumnSettingsState,
  useTablePagination,
  useTableSortable,
  VStack,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { LayoutGrid, List, Settings2, User, Users, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchWorkers,
  genderLabel,
  type WorkerListRow,
  type WorkersQuery,
} from '../api/people-client.ts';
import { CreateWorkerDialog } from '../components/create-worker-dialog.tsx';
import { PeopleCardGrid } from '../components/people-card-grid.tsx';
import { PeopleFilterBar } from '../components/people-filter-bar.tsx';
import { peopleKeys } from '../state/query-keys.ts';

// Astryx Table columns require `T extends Record<string, unknown>`; the DTO
// lacks an index signature, so alias locally (do not touch the shared DTO).
type WorkerRow = WorkerListRow & Record<string, unknown>;

function LifecycleBadge({ stage }: { stage: string | null }) {
  const variantMap: Record<string, 'neutral' | 'error'> = {
    active: 'neutral',
    onboarding: 'neutral',
    offboarding: 'neutral',
    terminated: 'error',
    leave: 'neutral',
  };
  const variant = (stage ? variantMap[stage] : undefined) ?? 'neutral';
  return <Badge variant={variant} className="capitalize" label={stage} />;
}

// All columns are toggleable. 'full_name' appears in the Columns menu like
// every other column — always on by default, but can be hidden.
const COLUMN_OPTIONS: ColumnSettingsOption[] = [
  { key: 'full_name', label: 'Employee' },
  { key: 'accounts', label: 'Account' },
  { key: 'work_email', label: 'Work email' },
  { key: 'manager_name', label: 'Direct manager' },
  { key: 'lifecycle_stage', label: 'Status' },
  { key: 'onboarding_date', label: 'Onboarding' },
  { key: 'offboarding_date', label: 'Offboarding' },
  { key: 'phone', label: 'Phone' },
  { key: 'gender', label: 'Gender' },
  { key: 'skills', label: 'Techstack' },
];
const DEFAULT_COLUMN_KEYS = COLUMN_OPTIONS.map((c) => c.key);

export function PeoplePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canProvision = usePermission('people.worker.create');
  const [activeColumnKeys, setActiveColumnKeys] = useState<string[]>(DEFAULT_COLUMN_KEYS);
  const [query, setQuery] = useState<WorkersQuery>({ page: 1, pageSize: 25 });
  const [view, setView] = useState<'list' | 'cards'>('list');

  const activeFiltersCount =
    (query.status?.length ?? 0) +
    (query.account_id?.length ?? 0) +
    (query.project_id?.length ?? 0) +
    (query.skill_id?.length ?? 0);

  const handleClearFilters = useCallback(() => {
    setQuery((q) => ({
      ...q,
      status: undefined,
      account_id: undefined,
      project_id: undefined,
      skill_id: undefined,
      page: 1,
    }));
  }, []);

  const [searchText, setSearchText] = useState(query.search ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSearchText(query.search ?? '');
  }, [query.search]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchText(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setQuery((q) => ({ ...q, search: value || undefined, page: 1 }));
    }, 300);
  }, []);

  const patchQuery = useCallback(
    (patch: Partial<WorkersQuery>) => setQuery((q) => ({ ...q, ...patch, page: 1 })),
    [],
  );

  const { data, isLoading, error } = useQuery({
    queryKey: peopleKeys.workers(query),
    queryFn: () => fetchWorkers(query),
    placeholderData: keepPreviousData,
  });

  const rows = (data?.rows ?? []) as WorkerRow[];
  const total = data?.total ?? 0;
  const pageSize = query.pageSize ?? 25;

  // Sort-state mapping: existing {field, dir} query state <-> Astryx's
  // [{ sortKey, direction }] shape.
  const sortState: TableSortState = query.sort
    ? [
        {
          sortKey: query.sort.field,
          direction: query.sort.dir === 'desc' ? 'descending' : 'ascending',
        },
      ]
    : [];
  const sortable = useTableSortable<WorkerRow>({
    sort: sortState,
    onSortChange: (s) => {
      const entry = s[0];
      setQuery((q) => ({
        ...q,
        sort: entry
          ? { field: entry.sortKey, dir: entry.direction === 'descending' ? 'desc' : 'asc' }
          : undefined,
      }));
    },
  });

  // query.page is already 1-based, matching the Astryx pager's contract directly.
  const pagination = useTablePagination<WorkerRow>({
    page: query.page ?? 1,
    onPageChange: (p) => setQuery((q) => ({ ...q, page: p })),
    totalItems: total,
    pageSize,
    onPageSizeChange: (ps) => setQuery((q) => ({ ...q, pageSize: ps })),
    pageSizeOptions: [25, 50, 100],
  });

  const columnSettingsState = useTableColumnSettingsState({
    columns: COLUMN_OPTIONS,
    activeColumnKeys,
    onChangeActiveColumnKeys: (keys) => setActiveColumnKeys([...keys]),
  });
  const columnSettings = useTableColumnSettings<WorkerRow>(
    columnSettingsState.columnSettingsConfig,
  );

  const columns = useMemo<TableColumn<WorkerRow>[]>(
    () => [
      {
        key: 'full_name',
        header: 'Employee',
        width: proportional(2),
        sortable: true,
        renderCell: (r) => (
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar name={r.full_name} size={32} />
            <div className="min-w-0">
              <div className="truncate font-medium">{r.full_name}</div>
              {r.job_title && (
                <div className="truncate text-xs text-secondary leading-tight">{r.job_title}</div>
              )}
            </div>
          </div>
        ),
      },
      {
        key: 'accounts',
        header: 'Account',
        width: proportional(1),
        renderCell: (r) =>
          r.accounts.length > 0 ? (
            <div className="flex items-center gap-1 overflow-hidden h-5 max-w-[200px]">
              {r.accounts.map((a) => (
                <Badge
                  key={a.id}
                  variant="neutral"
                  className="text-xs px-1.5 py-0 whitespace-nowrap"
                  label={a.name}
                />
              ))}
            </div>
          ) : (
            <div className="flex items-center h-5 text-secondary">—</div>
          ),
      },
      {
        key: 'work_email',
        header: 'Work email',
        width: proportional(2),
        renderCell: (r) => (
          <span className="font-mono text-sm text-secondary truncate block">
            {r.work_email || '—'}
          </span>
        ),
      },
      {
        key: 'manager_name',
        header: 'Direct manager',
        width: proportional(1),
        renderCell: (r) => (
          <span className="text-secondary whitespace-nowrap">{r.manager_name || '—'}</span>
        ),
      },
      {
        key: 'lifecycle_stage',
        header: 'Status',
        width: pixel(110),
        sortable: true,
        renderCell: (r) => <LifecycleBadge stage={r.lifecycle_stage} />,
      },
      {
        key: 'onboarding_date',
        header: 'Onboarding',
        width: pixel(110),
        sortable: true,
        renderCell: (r) => <span className="text-secondary">{r.onboarding_date || '—'}</span>,
      },
      {
        key: 'offboarding_date',
        header: 'Offboarding',
        width: pixel(110),
        renderCell: (r) => <span className="text-secondary">{r.offboarding_date || '—'}</span>,
      },
      {
        key: 'phone',
        header: 'Phone',
        width: pixel(120),
        renderCell: (r) => (
          <span className="text-secondary tabular-nums whitespace-nowrap">{r.phone || '—'}</span>
        ),
      },
      {
        key: 'gender',
        header: 'Gender',
        width: pixel(90),
        renderCell: (r) => (
          <span className="text-secondary whitespace-nowrap">{genderLabel(r.gender)}</span>
        ),
      },
      {
        key: 'skills',
        header: 'Techstack',
        width: proportional(1),
        renderCell: (r) => (
          <CounterBadgePopover
            items={r.skills}
            title="Techstack"
            limit={2}
            type="badge"
            badgeVariant="neutral"
          />
        ),
      },
    ],
    [],
  );

  const actions = canProvision ? (
    <CreateWorkerDialog
      onCreated={() =>
        void queryClient.invalidateQueries({ queryKey: [...peopleKeys.all, 'workers'] })
      }
    />
  ) : undefined;

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={1}>
            <Breadcrumbs variant="supporting">
              <BreadcrumbItem href="/people">People</BreadcrumbItem>
              {/* Deliberate exception to the title-wins rule: the page's h1 is "People", which
                  collides with the app root crumb above. "Employees" is the manifest nav label
                  for /people/employees — the item a user actually clicks to reach this page —
                  and keeps this trail consistent with worker-profile-page's middle crumb. */}
              <BreadcrumbItem isCurrent>Employees</BreadcrumbItem>
            </Breadcrumbs>
            <HStack hAlign="between" vAlign="center" gap={2}>
              <HStack gap={2} vAlign="center">
                <Text as="h1" size="lg" weight="semibold">
                  People
                </Text>
              </HStack>
              {actions}
            </HStack>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
          <div className="w-full space-y-4 p-6">
            {error ? (
              <Banner status="error" title={(error as Error).message} />
            ) : (
              <>
                {/* Control & Filter Layout */}
                <div className="flex flex-col gap-4">
                  {/* Row 1: Search & Controls */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Input
                        label="Search people"
                        isLabelHidden
                        className="w-64"
                        size="sm"
                        placeholder="Search people…"
                        value={searchText}
                        onChange={(value) => handleSearchChange(value)}
                      />
                      <span className="text-disabled select-none">|</span>
                      {activeFiltersCount > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleClearFilters}
                          icon={<X className="size-3.5" />}
                          label={`Clear filters (${activeFiltersCount})`}
                        />
                      )}
                      <div className="flex items-center gap-2 text-base text-secondary">
                        <span className="font-medium text-primary flex items-center gap-1">
                          <User className="size-3.5 text-secondary" />
                          {total} {total === 1 ? 'person' : 'people'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {view === 'list' && (
                        <Popover
                          placement="below"
                          alignment="end"
                          label="Toggle columns"
                          content={
                            <div className="flex min-w-[180px] flex-col gap-1 p-2">
                              <div className="px-1 pb-1 text-xs font-medium uppercase tracking-[0.04em] text-secondary">
                                Toggle columns
                              </div>
                              {COLUMN_OPTIONS.map((col) => (
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
                      )}
                      <SegmentedControl
                        label="Directory view"
                        value={view}
                        onChange={(v) => setView(v as 'list' | 'cards')}
                      >
                        <SegmentedControlItem
                          value="list"
                          label="List"
                          icon={<List className="size-3.5" />}
                        />
                        <SegmentedControlItem
                          value="cards"
                          label="Cards"
                          icon={<LayoutGrid className="size-3.5" />}
                        />
                      </SegmentedControl>
                    </div>
                  </div>

                  {/* Row 2: Dropdown Filters */}
                  <PeopleFilterBar query={query} onChange={patchQuery} />
                </div>
                {view === 'list' ? (
                  isLoading ? (
                    <div className="space-y-2">
                      {['s0', 's1', 's2', 's3', 's4'].map((id) => (
                        <Skeleton key={id} height={44} />
                      ))}
                    </div>
                  ) : (
                    <Table
                      data={rows}
                      columns={columns}
                      idKey="worker_id"
                      density="compact"
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
                                  to: '/people/employees/$workerId',
                                  params: { workerId: item.worker_id },
                                }),
                            },
                          }),
                        },
                      }}
                      emptyState={
                        searchText || activeFiltersCount > 0 ? (
                          <EmptyState
                            icon={<Users className="size-6" />}
                            title="No matching people"
                            description="Try adjusting your search or filters."
                          />
                        ) : (
                          <EmptyState
                            icon={<Users className="size-6" />}
                            title="No employees yet"
                            description="Add an employee to get started."
                          />
                        )
                      }
                    />
                  )
                ) : (
                  <PeopleCardGrid
                    rows={rows}
                    total={total}
                    isLoading={isLoading}
                    query={query}
                    setQuery={setQuery}
                    onRowClick={(row) =>
                      void navigate({
                        to: '/people/employees/$workerId',
                        params: { workerId: row.worker_id },
                      })
                    }
                  />
                )}
              </>
            )}
          </div>
        </LayoutContent>
      }
    />
  );
}
