import type { RowSelectionState } from '@seta/shared-ui';
import {
  Alert,
  AlertDescription,
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { LayoutGrid, List, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createWorker,
  fetchWorkers,
  genderLabel,
  setPortalAccessBulk,
  type WorkerListRow,
  type WorkersQuery,
} from '../api/people-client.ts';
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

function CreateWorkerDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      createWorker({
        full_name: fullName,
        work_email: workEmail || undefined,
      }),
    onSuccess: () => {
      toast.success('Worker created');
      onCreated();
      setOpen(false);
      reset();
    },
    onError: (e: Error) => setError(e.message),
  });

  function reset() {
    setFullName('');
    setWorkEmail('');
    setError(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">New worker</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add worker</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Full name *</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Work email</Label>
            <Input value={workEmail} onChange={(e) => setWorkEmail(e.target.value)} type="email" />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !fullName.trim()}
            >
              {mutation.isPending ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PeoplePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canProvision = usePermission('people.worker.provision');
  const canSetPortal = usePermission('people.worker.portal_access.set');
  const canReadAll = usePermission('people.worker.read.all');
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [query, setQuery] = useState<WorkersQuery>({ page: 1, pageSize: 25 });
  const [view, setView] = useState<'list' | 'cards'>('list');

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

  const selectedWorkerIds = useMemo(
    () => Object.keys(rowSelection).filter((k) => rowSelection[k]),
    [rowSelection],
  );

  const bulkMutation = useMutation({
    mutationFn: (enabled: boolean) => setPortalAccessBulk(selectedWorkerIds, enabled),
    onSuccess: (r) => {
      const changed = r.results.filter((x) => x.status === 'changed').length;
      toast.success(`Portal access updated for ${changed} worker(s)`);
      setRowSelection({});
      void queryClient.invalidateQueries({ queryKey: [...peopleKeys.all, 'workers'] });
    },
    onError: (e: Error) => toast.error(e.message),
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
            <div className="flex flex-wrap gap-1">
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
            <span className="text-ink-muted">—</span>
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
        cell: ({ row }: CellCtx) =>
          row.original.skills.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {row.original.skills.map((s) => (
                <Badge key={s.id} variant="secondary" className="text-[11px] px-1.5 py-0">
                  {s.name}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-ink-muted">—</span>
          ),
      },
      {
        id: 'portal',
        header: 'Access',
        enableSorting: false,
        cell: ({ row }: CellCtx) => (
          <Badge
            variant={row.original.portal_access ? 'default' : 'outline'}
            className="whitespace-nowrap"
          >
            {row.original.portal_access ? 'Login on' : 'No login'}
          </Badge>
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
            {selectedWorkerIds.length > 0 && (
              <div className="flex items-center justify-between gap-3 rounded-md border border-hairline bg-surface-raised px-4 py-2">
                <span className="text-body-sm text-ink-muted">
                  {selectedWorkerIds.length} selected
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={bulkMutation.isPending}
                    onClick={() => bulkMutation.mutate(true)}
                  >
                    Enable portal access
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={bulkMutation.isPending}
                    onClick={() => bulkMutation.mutate(false)}
                  >
                    Disable portal access
                  </Button>
                </div>
              </div>
            )}
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
                  <div className="flex items-center gap-2 text-body-sm text-ink-muted">
                    <span className="font-medium text-ink">
                      {total} {total === 1 ? 'person' : 'people'}
                    </span>
                    {!canReadAll && (
                      <Badge variant="outline" title="You see only people related to you">
                        Scoped view
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
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
                columnFilters={[]}
                onColumnFiltersChange={() => {}}
                pagination={pagination}
                onPaginationChange={onPaginationChange}
                pageCount={Math.max(1, Math.ceil(total / pageSize))}
                rowCount={total}
                getRowId={(r: WorkerListRow) => r.worker_id}
                enableRowSelection={canSetPortal}
                rowSelection={rowSelection}
                onRowSelectionChange={setRowSelection}
                emptyState={
                  <EmptyState
                    icon={<Users className="size-6" />}
                    title="No workers yet"
                    description="Add a worker to get started."
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
