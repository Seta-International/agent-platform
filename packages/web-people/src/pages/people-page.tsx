import {
  Alert,
  AlertDescription,
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  CounterBadgePopover,
  DataTable,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Input,
  Label,
  PageChrome,
  SegmentedControl,
  toast,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { OnChangeFn, PaginationState, SortingState } from '@tanstack/react-table';
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

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

function LifecycleBadge({ stage }: { stage: string | null }) {
  const variantMap: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    active: 'default',
    onboarding: 'secondary',
    offboarding: 'outline',
    terminated: 'destructive',
    leave: 'outline',
  };
  const variant = (stage ? variantMap[stage] : undefined) ?? 'secondary';
  return (
    <Badge variant={variant} className="capitalize">
      {stage}
    </Badge>
  );
}

const HIDEABLE_COLUMNS = [
  { id: 'accounts', label: 'Account' },
  { id: 'work_email', label: 'Work email' },
  { id: 'manager_name', label: 'Direct manager' },
  { id: 'lifecycle_stage', label: 'Status' },
  { id: 'onboarding_date', label: 'Onboarding' },
  { id: 'offboarding_date', label: 'Offboarding' },
  { id: 'phone', label: 'Phone' },
  { id: 'gender', label: 'Gender' },
  { id: 'skills', label: 'Techstack' },
];

export function PeoplePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canProvision = usePermission('people.worker.create');
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({});
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

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pageSize = query.pageSize ?? 25;
  const pagination: PaginationState = { pageIndex: (query.page ?? 1) - 1, pageSize };
  const sorting: SortingState = query.sort
    ? [{ id: query.sort.field, desc: query.sort.dir === 'desc' }]
    : [];

  const onPaginationChange: OnChangeFn<PaginationState> = (u) =>
    setQuery((q) => {
      const cur = { pageIndex: (q.page ?? 1) - 1, pageSize: q.pageSize ?? 25 };
      const next = typeof u === 'function' ? u(cur) : u;
      return { ...q, page: next.pageIndex + 1, pageSize: next.pageSize };
    });

  const onSortingChange: OnChangeFn<SortingState> = (u) =>
    setQuery((q) => {
      const cur = q.sort ? [{ id: q.sort.field, desc: q.sort.dir === 'desc' }] : [];
      const next = typeof u === 'function' ? u(cur) : u;
      const s = next[0];
      return { ...q, sort: s ? { field: s.id, dir: s.desc ? 'desc' : 'asc' } : undefined };
    });

  const columns = useMemo(() => {
    type CellCtx = { row: { original: WorkerListRow } };
    return [
      {
        id: 'full_name',
        accessorKey: 'full_name',
        header: 'Employee',
        enableSorting: true,
        cell: ({ row }: CellCtx) => (
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar className="size-7 shrink-0">
              <AvatarFallback>{initials(row.original.full_name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="truncate font-medium">{row.original.full_name}</div>
              {row.original.job_title && (
                <div className="truncate text-[11px] text-ink-muted leading-tight">
                  {row.original.job_title}
                </div>
              )}
            </div>
          </div>
        ),
      },
      {
        id: 'accounts',
        header: 'Account',
        enableSorting: false,
        cell: ({ row }: CellCtx) =>
          row.original.accounts.length > 0 ? (
            <div className="flex items-center gap-1 overflow-hidden h-5 max-w-[200px]">
              {row.original.accounts.map((a) => (
                <Badge
                  key={a.id}
                  variant="outline"
                  className="text-[11px] px-1.5 py-0 whitespace-nowrap"
                >
                  {a.name}
                </Badge>
              ))}
            </div>
          ) : (
            <div className="flex items-center h-5 text-ink-muted">—</div>
          ),
      },
      {
        id: 'work_email',
        accessorKey: 'work_email',
        header: 'Work email',
        enableSorting: false,
        cell: ({ row }: CellCtx) => (
          <span className="font-mono text-[12.5px] text-ink-muted truncate block">
            {row.original.work_email || '—'}
          </span>
        ),
      },
      {
        id: 'manager_name',
        header: 'Direct manager',
        enableSorting: false,
        cell: ({ row }: CellCtx) => (
          <span className="text-ink-muted whitespace-nowrap">
            {row.original.manager_name || '—'}
          </span>
        ),
      },
      {
        id: 'lifecycle_stage',
        header: 'Status',
        enableSorting: true,
        cell: ({ row }: CellCtx) => <LifecycleBadge stage={row.original.lifecycle_stage} />,
      },
      {
        id: 'onboarding_date',
        header: 'Onboarding',
        enableSorting: true,
        cell: ({ row }: CellCtx) => (
          <span className="text-ink-muted">{row.original.onboarding_date || '—'}</span>
        ),
      },
      {
        id: 'offboarding_date',
        header: 'Offboarding',
        enableSorting: false,
        cell: ({ row }: CellCtx) => (
          <span className="text-ink-muted">{row.original.offboarding_date || '—'}</span>
        ),
      },
      {
        id: 'phone',
        header: 'Phone',
        enableSorting: false,
        cell: ({ row }: CellCtx) => (
          <span className="text-ink-muted tabular-nums whitespace-nowrap">
            {row.original.phone || '—'}
          </span>
        ),
      },
      {
        id: 'gender',
        header: 'Gender',
        enableSorting: false,
        cell: ({ row }: CellCtx) => (
          <span className="text-ink-muted whitespace-nowrap">
            {genderLabel(row.original.gender)}
          </span>
        ),
      },
      {
        id: 'skills',
        header: 'Techstack',
        enableSorting: false,
        cell: ({ row }: CellCtx) => (
          <CounterBadgePopover
            items={row.original.skills}
            title="Techstack"
            limit={2}
            type="badge"
            badgeVariant="secondary"
          />
        ),
      },
    ];
  }, []);

  const actions = canProvision ? (
    <CreateWorkerDialog
      onCreated={() =>
        void queryClient.invalidateQueries({ queryKey: [...peopleKeys.all, 'workers'] })
      }
    />
  ) : undefined;

  return (
    <PageChrome title="People" actions={actions}>
      <div className="w-full space-y-4 p-6">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        ) : (
          <>
            {/* Control & Filter Layout */}
            <div className="flex flex-col gap-4">
              {/* Row 1: Search & Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Input
                    className="h-9 w-64"
                    placeholder="Search people…"
                    value={searchText}
                    onChange={(e) => handleSearchChange(e.target.value)}
                  />
                  <span className="text-ink-tertiary select-none">|</span>
                  {activeFiltersCount > 0 && (
                    <button
                      type="button"
                      onClick={handleClearFilters}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:opacity-80 transition-opacity focus:outline-none cursor-pointer"
                    >
                      <X className="size-3.5" />
                      Clear filters ({activeFiltersCount})
                    </button>
                  )}
                  <div className="flex items-center gap-2 text-body-sm text-ink-muted">
                    <span className="font-medium text-ink flex items-center gap-1">
                      <User className="size-3.5 text-ink-muted" />
                      {total} {total === 1 ? 'person' : 'people'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {view === 'list' && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-2 transition-colors h-7 focus:outline-none"
                        >
                          <Settings2 className="size-3.5" />
                          Columns
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {HIDEABLE_COLUMNS.map((col) => {
                          const isVisible = columnVisibility[col.id] ?? true;
                          return (
                            <DropdownMenuCheckboxItem
                              key={col.id}
                              checked={isVisible}
                              onSelect={(e) => e.preventDefault()}
                              onCheckedChange={(checked) => {
                                setColumnVisibility((prev) => ({
                                  ...prev,
                                  [col.id]: checked,
                                }));
                              }}
                            >
                              {col.label}
                            </DropdownMenuCheckboxItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <SegmentedControl
                    aria-label="Directory view"
                    value={view}
                    onValueChange={setView}
                    options={[
                      { value: 'list', label: 'List', icon: <List className="size-3.5" /> },
                      { value: 'cards', label: 'Cards', icon: <LayoutGrid className="size-3.5" /> },
                    ]}
                  />
                </div>
              </div>

              {/* Row 2: Dropdown Filters */}
              <PeopleFilterBar query={query} onChange={patchQuery} />
            </div>
            {view === 'list' ? (
              <DataTable
                mode="server"
                columns={columns}
                data={rows}
                isLoading={isLoading}
                sorting={sorting}
                onSortingChange={onSortingChange}
                globalFilter=""
                onGlobalFilterChange={() => {}}
                enableGlobalFilter={false}
                enableColumnVisibility={false}
                columnVisibility={columnVisibility}
                onColumnVisibilityChange={setColumnVisibility}
                columnFilters={[]}
                onColumnFiltersChange={() => {}}
                pagination={pagination}
                onPaginationChange={onPaginationChange}
                pageCount={Math.max(1, Math.ceil(total / pageSize))}
                rowCount={total}
                getRowId={(r: WorkerListRow) => r.worker_id}
                getRowClassName={() => 'h-14'}
                enableRowSelection={false}
                rowSelection={{}}
                onRowSelectionChange={() => {}}
                emptyState={
                  <EmptyState
                    icon={<Users className="size-6" />}
                    title="No workers yet"
                    description="Add a worker to get started."
                  />
                }
                noResultsState={
                  <EmptyState
                    icon={<Users className="size-6" />}
                    title="No matching people"
                    description="Try adjusting your search or filters."
                  />
                }
                onRowClick={(row) =>
                  void navigate({
                    to: '/people/employees/$workerId',
                    params: { workerId: row.original.worker_id },
                  })
                }
              />
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
    </PageChrome>
  );
}
