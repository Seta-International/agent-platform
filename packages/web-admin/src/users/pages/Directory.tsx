import {
  Badge,
  Button,
  cn,
  DataTable,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  PageChrome,
  PageChromeToolbar,
  type RowSelectionState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import type { ColumnDef, OnChangeFn, PaginationState, Row } from '@tanstack/react-table';
import { MoreHorizontal, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PersonAvatar } from '../../components/person-avatar.tsx';
import { useGroupsQuery } from '../../groups/hooks/useGroups.ts';
import type { DirectoryRow } from '../api/directory-client.ts';
import { BulkGroupBar } from '../components/BulkGroupBar.tsx';
import { UserDetailSheet } from '../components/UserDetailSheet.tsx';
import type { DirectorySearch } from '../directory-search.ts';
import { useDirectory, useProvision, useReactivate, useSuspend } from '../hooks/useDirectory.ts';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All accounts' },
  { value: 'none', label: 'No account' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
] as const;

const EMPLOYMENT_OPTIONS = [
  { value: 'all', label: 'All employment' },
  { value: 'active', label: 'Employed' },
  { value: 'terminated', label: 'Terminated' },
] as const;

function FilterSelect({
  value,
  onValueChange,
  options,
  ariaLabel,
  className,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger aria-label={ariaLabel} className={cn('h-8 text-body-sm', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const ACCOUNT_STATUS_BADGE: Record<
  DirectoryRow['account_status'],
  'outline' | 'success' | 'destructive'
> = {
  none: 'outline',
  active: 'success',
  suspended: 'destructive',
};

const ACCOUNT_STATUS_LABEL: Record<DirectoryRow['account_status'], string> = {
  none: 'No account',
  active: 'Active',
  suspended: 'Suspended',
};

const EMPLOYMENT_BADGE: Record<DirectoryRow['employment_status'], 'success' | 'secondary'> = {
  active: 'success',
  terminated: 'secondary',
};

const EMPLOYMENT_LABEL: Record<DirectoryRow['employment_status'], string> = {
  active: 'Employed',
  terminated: 'Terminated',
};

const DEFAULT_PAGE_SIZE = 25;

interface DirectoryProps {
  search: DirectorySearch;
  onSearch: (next: (prev: DirectorySearch) => DirectorySearch) => void;
}

export function Directory({ search, onSearch }: DirectoryProps) {
  const [selectedRow, setSelectedRow] = useState<DirectoryRow | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<DirectoryRow | null>(null);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const canWrite = usePermission('identity.user.write');

  // URL search params are the source of truth (shareable, survive refresh).
  const status = search.status ?? 'all';
  const employment = search.employment ?? 'all';
  const group = search.group ?? 'all';
  const page = search.page ?? 0;
  const pageSize = search.size ?? DEFAULT_PAGE_SIZE;

  // Changing any filter resets to the first page; pagination keeps the filters.
  const applyFilter = useCallback(
    (patch: Partial<DirectorySearch>) =>
      onSearch((prev) => ({ ...prev, ...patch, page: undefined })),
    [onSearch],
  );
  const setPage = useCallback(
    (p: number) => onSearch((prev) => ({ ...prev, page: p > 0 ? p : undefined })),
    [onSearch],
  );
  // Changing page size resets to the first page so the offset stays valid.
  const setPageSize = useCallback(
    (s: number) =>
      onSearch((prev) => ({
        ...prev,
        page: undefined,
        size: s === DEFAULT_PAGE_SIZE ? undefined : s,
      })),
    [onSearch],
  );

  // Local mirror keeps the search box responsive; the URL stays the source of truth.
  const [qInput, setQInput] = useState(search.q ?? '');
  useEffect(() => setQInput(search.q ?? ''), [search.q]);

  const { data: groups = [] } = useGroupsQuery();
  const groupOptions = useMemo(
    () => [
      { value: 'all', label: 'All groups' },
      ...groups.map((g) => ({ value: g.group_id, label: g.name })),
    ],
    [groups],
  );

  const hasFilters = status !== 'all' || employment !== 'all' || group !== 'all' || !!search.q;

  const { data, isLoading } = useDirectory({
    search: search.q?.trim() || undefined,
    status: status === 'all' ? undefined : status,
    employment: employment === 'all' ? undefined : employment,
    group_id: group === 'all' ? undefined : group,
    page,
    pageSize,
  });

  const provision = useProvision();
  const suspend = useSuspend();
  const reactivate = useReactivate();

  const rows = data?.rows ?? [];

  // Accumulator: person_id → user_id, surviving pagination. rowSelection drives
  // the table checkboxes per page; selectedUsers is the durable cross-page set.
  const [selectedUsers, setSelectedUsers] = useState<Record<string, string>>({});

  const handleRowSelectionChange = useCallback<OnChangeFn<RowSelectionState>>(
    (updater) => {
      setRowSelection((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        setSelectedUsers((acc) => {
          const merged = { ...acc };
          // Newly selected on this page → resolve user_id from the visible rows.
          for (const personId of Object.keys(next)) {
            if (next[personId] && !prev[personId]) {
              const userId = rows.find((r) => r.person_id === personId)?.user_id;
              if (userId) merged[personId] = userId;
            }
          }
          // Newly deselected on this page → drop from accumulator.
          for (const personId of Object.keys(prev)) {
            if (prev[personId] && !next[personId]) delete merged[personId];
          }
          return merged;
        });
        return next;
      });
    },
    [rows],
  );

  const selectedUserIds = useMemo(() => Object.values(selectedUsers), [selectedUsers]);

  function clearSelection() {
    setRowSelection({});
    setSelectedUsers({});
  }

  const rowCount = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(rowCount / pageSize));

  const columns = useMemo<ColumnDef<DirectoryRow>[]>(
    () => [
      {
        id: 'full_name',
        accessorKey: 'full_name',
        header: 'Name',
        cell: ({ row }) => (
          <div className="flex items-center gap-2.5">
            <PersonAvatar name={row.original.full_name} />
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium text-ink">{row.original.full_name}</span>
              {row.original.work_email && (
                <span className="truncate text-caption text-ink-tertiary">
                  {row.original.work_email}
                </span>
              )}
            </div>
          </div>
        ),
      },
      {
        id: 'job_title',
        accessorKey: 'job_title',
        header: 'Job title',
        cell: ({ row }) =>
          row.original.job_title ? (
            <span>{row.original.job_title}</span>
          ) : (
            <span className="text-ink-tertiary">{'—'}</span>
          ),
      },
      {
        id: 'employment_status',
        header: 'Employment',
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={EMPLOYMENT_BADGE[row.original.employment_status]}>
            {EMPLOYMENT_LABEL[row.original.employment_status]}
          </Badge>
        ),
      },
      {
        id: 'account_status',
        header: 'Account',
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={ACCOUNT_STATUS_BADGE[row.original.account_status]}>
            {ACCOUNT_STATUS_LABEL[row.original.account_status]}
          </Badge>
        ),
      },
      {
        id: 'groups',
        header: 'Groups',
        enableSorting: false,
        cell: ({ row }) => {
          const groups = row.original.groups ?? [];
          if (groups.length === 0) return <span className="text-ink-tertiary">{'—'}</span>;
          return (
            <div className="flex flex-wrap items-center gap-1">
              {groups.slice(0, 2).map((g) => (
                <Badge key={g} variant="secondary">
                  {g}
                </Badge>
              ))}
              {groups.length > 2 && (
                <span className="text-caption text-ink-tertiary">+{groups.length - 2}</span>
              )}
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => {
          if (!canWrite) return null;
          const r = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="tertiary"
                  size="icon"
                  aria-label={`Row actions for ${r.full_name}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {r.account_status === 'none' && (
                  <DropdownMenuItem onSelect={() => provision.mutate(r.person_id)}>
                    Provision
                  </DropdownMenuItem>
                )}
                {r.account_status === 'active' && r.user_id && (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={() => setSuspendTarget(r)}
                  >
                    Suspend
                  </DropdownMenuItem>
                )}
                {r.account_status === 'suspended' && r.user_id && (
                  <DropdownMenuItem onSelect={() => reactivate.mutate(r.user_id ?? '')}>
                    Reactivate
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [canWrite, provision, reactivate],
  );

  const subtitle = isLoading
    ? 'Loading…'
    : data
      ? `${rowCount.toLocaleString()} ${rowCount === 1 ? 'person' : 'people'}`
      : undefined;

  const pagination: PaginationState = { pageIndex: page, pageSize };

  return (
    <PageChrome
      breadcrumb={['Admin']}
      title="Directory"
      subtitle={subtitle}
      toolbar={
        <PageChromeToolbar
          left={
            <div className="flex flex-wrap items-center gap-2">
              <FilterSelect
                ariaLabel="Filter by group"
                value={group}
                onValueChange={(v) => applyFilter({ group: v === 'all' ? undefined : v })}
                options={groupOptions}
                className="w-44"
              />
              <FilterSelect
                ariaLabel="Filter by account status"
                value={status}
                onValueChange={(v) =>
                  applyFilter({
                    status: v === 'all' ? undefined : (v as DirectorySearch['status']),
                  })
                }
                options={STATUS_OPTIONS}
                className="w-40"
              />
              <FilterSelect
                ariaLabel="Filter by employment"
                value={employment}
                onValueChange={(v) =>
                  applyFilter({
                    employment: v === 'all' ? undefined : (v as DirectorySearch['employment']),
                  })
                }
                options={EMPLOYMENT_OPTIONS}
                className="w-40"
              />
              {hasFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-ink-subtle"
                  onClick={() => {
                    setQInput('');
                    onSearch(() => ({}));
                  }}
                >
                  <X className="size-3.5" aria-hidden />
                  Clear
                </Button>
              )}
            </div>
          }
          right={
            <Input
              placeholder="Search people…"
              value={qInput}
              onChange={(e) => {
                setQInput(e.target.value);
                applyFilter({ q: e.target.value.trim() || undefined });
              }}
              className="h-8 w-64 text-body-sm"
              aria-label="Search people"
            />
          }
        />
      }
    >
      {canWrite && selectedUserIds.length > 0 && (
        <BulkGroupBar selectedUserIds={selectedUserIds} onClearSelection={clearSelection} />
      )}
      <div className="px-6 py-4">
        <DataTable
          mode="server"
          data={rows}
          columns={columns}
          isLoading={isLoading}
          enableRowSelection={(row: Row<DirectoryRow>) => row.original.account_status !== 'none'}
          rowSelection={rowSelection}
          onRowSelectionChange={handleRowSelectionChange}
          enableGlobalFilter={false}
          enableColumnVisibility={false}
          sorting={[]}
          onSortingChange={() => undefined}
          columnFilters={[]}
          onColumnFiltersChange={() => undefined}
          globalFilter=""
          onGlobalFilterChange={() => undefined}
          pagination={pagination}
          onPaginationChange={(updater) => {
            const next = typeof updater === 'function' ? updater(pagination) : updater;
            if (next.pageSize !== pageSize) setPageSize(next.pageSize);
            else setPage(next.pageIndex);
          }}
          pageCount={pageCount}
          rowCount={rowCount}
          getRowId={(r) => r.person_id}
          onRowClick={(row) => setSelectedRow(row.original)}
        />
      </div>

      {/* Suspend confirm dialog */}
      <Dialog
        open={suspendTarget !== null}
        onOpenChange={(o) => {
          if (!o) setSuspendTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend account?</DialogTitle>
            <DialogDescription>
              {suspendTarget?.full_name}'s access will be revoked immediately. You can reactivate at
              any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button
              variant="default"
              className="bg-destructive text-on-primary hover:bg-destructive/90"
              onClick={() => {
                if (suspendTarget?.user_id) suspend.mutate(suspendTarget.user_id);
                setSuspendTarget(null);
              }}
            >
              Suspend
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail sheet */}
      <UserDetailSheet
        row={selectedRow}
        open={selectedRow !== null}
        onOpenChange={(o) => {
          if (!o) setSelectedRow(null);
        }}
      />
    </PageChrome>
  );
}
