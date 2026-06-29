import {
  Badge,
  DataTable,
  Input,
  PageChrome,
  PageChromeToolbar,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import type { ColumnDef, PaginationState } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import type { DirectoryRow } from '../api/directory-client.ts';
import { useDirectory } from '../hooks/useDirectory.ts';

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

  const canWrite = usePermission('identity.user.write');

  const { data, isLoading } = useDirectory({
    search: search.trim() || undefined,
    status: status === 'all' ? undefined : status,
    page,
  });

  const rows = data?.rows ?? [];
  const hasMore = data?.hasMore ?? false;
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
        // A2.4/A2.5: Provision / Suspend / Reactivate action menu goes here,
        // gated by canWrite and row.original.account_status.
        // A2.4/A2.5 hook-in: replace with DropdownMenu gated by canWrite + row status.
        cell: ({ row }) => (canWrite && row.original.person_id ? <span /> : null),
      },
    ],
    [canWrite],
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
      <div className="px-6 py-4">
        <DataTable
          mode="server"
          data={rows}
          columns={columns}
          isLoading={isLoading}
          enableRowSelection
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
        />
      </div>
    </PageChrome>
  );
}
