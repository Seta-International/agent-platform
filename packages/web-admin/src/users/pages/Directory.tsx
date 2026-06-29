import {
  Badge,
  Button,
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
import type { ColumnDef, PaginationState, Row } from '@tanstack/react-table';
import { MoreHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { DirectoryRow } from '../api/directory-client.ts';
import { BulkRoleBar } from '../components/BulkRoleBar.tsx';
import { UserDetailSheet } from '../components/UserDetailSheet.tsx';
import { useDirectory, useProvision, useReactivate, useSuspend } from '../hooks/useDirectory.ts';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'none', label: 'No account' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
] as const;

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

const PAGE_SIZE = 25;

export function Directory() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(0);
  const [selectedRow, setSelectedRow] = useState<DirectoryRow | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<DirectoryRow | null>(null);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const canWrite = usePermission('identity.user.write');

  const { data, isLoading } = useDirectory({
    search: search.trim() || undefined,
    status: status === 'all' ? undefined : status,
    page,
  });

  const provision = useProvision();
  const suspend = useSuspend();
  const reactivate = useReactivate();

  const rows = data?.rows ?? [];
  const hasMore = data?.hasMore ?? false;

  const selectedUserIds = useMemo(
    () =>
      Object.keys(rowSelection)
        .filter((personId) => rowSelection[personId])
        .map((personId) => rows.find((r) => r.person_id === personId)?.user_id)
        .filter((id): id is string => !!id),
    [rowSelection, rows],
  );

  function clearSelection() {
    setRowSelection({});
  }

  const pageCount = page + (hasMore ? 2 : 1);
  const rowCount = page * PAGE_SIZE + rows.length + (hasMore ? 1 : 0);

  const columns = useMemo<ColumnDef<DirectoryRow>[]>(
    () => [
      {
        id: 'full_name',
        accessorKey: 'full_name',
        header: 'Name',
        cell: ({ row }) => <span className="font-medium text-ink">{row.original.full_name}</span>,
      },
      {
        id: 'work_email',
        accessorKey: 'work_email',
        header: 'Email',
        cell: ({ row }) =>
          row.original.work_email ? (
            <span className="text-ink-muted">{row.original.work_email}</span>
          ) : (
            <span className="text-ink-tertiary">{'—'}</span>
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
        id: 'roles',
        header: 'Roles',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.roles.length > 0 ? (
            <span className="text-body-sm text-ink-muted">{row.original.roles.join(', ')}</span>
          ) : (
            <span className="text-ink-tertiary">{'—'}</span>
          ),
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
      ? `${rowCount.toLocaleString()}${hasMore ? '+' : ''} ${rowCount === 1 ? 'person' : 'people'}`
      : undefined;

  const pagination: PaginationState = { pageIndex: page, pageSize: PAGE_SIZE };

  return (
    <PageChrome
      breadcrumb={['Admin']}
      title="Users"
      subtitle={subtitle}
      toolbar={
        <PageChromeToolbar
          left={
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v);
                setPage(0);
              }}
            >
              <SelectTrigger className="h-8 w-44 text-body-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
          right={
            <Input
              placeholder="Search people…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="h-8 w-64 text-body-sm"
              aria-label="Search people"
            />
          }
        />
      }
    >
      {canWrite && selectedUserIds.length > 0 && (
        <BulkRoleBar selectedUserIds={selectedUserIds} onClearSelection={clearSelection} />
      )}
      <div className="px-6 py-4">
        <DataTable
          mode="server"
          data={rows}
          columns={columns}
          isLoading={isLoading}
          enableRowSelection={(row: Row<DirectoryRow>) => row.original.account_status !== 'none'}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
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
            setPage(next.pageIndex);
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
