import {
  Badge,
  Button,
  DataTable,
  Dialog,
  DialogHeader,
  DropdownMenu,
  DropdownMenuItem,
  Input,
  Layout,
  LayoutFooter,
  PageChrome,
  PageChromeToolbar,
  type RowSelectionState,
  Selector,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import type { ColumnDef, OnChangeFn, PaginationState, Row } from '@tanstack/react-table';
import { MoreHorizontal, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PersonAvatar } from '../../components/person-avatar.tsx';
import { useGroupsQuery } from '../../groups/hooks/useGroups.ts';
import type { DirectoryRow } from '../api/directory-client.ts';
import { BulkGroupBar } from '../components/BulkGroupBar.tsx';
import { UserDetailSheet } from '../components/UserDetailSheet.tsx';
import type { DirectorySearch } from '../directory-search.ts';
import { useDirectory, useProvision, useReactivate, useSuspend } from '../hooks/useDirectory.ts';
import { useWorkersBrief } from '../hooks/useWork.ts';

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
  onChange,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  ariaLabel: string;
}) {
  return (
    <Selector
      label={ariaLabel}
      isLabelHidden
      size="sm"
      value={value}
      onChange={onChange}
      options={[...options]}
    />
  );
}

const ACCOUNT_STATUS_BADGE: Record<
  DirectoryRow['account_status'],
  'neutral' | 'success' | 'error'
> = {
  none: 'neutral',
  active: 'success',
  suspended: 'error',
};

const ACCOUNT_STATUS_LABEL: Record<DirectoryRow['account_status'], string> = {
  none: 'No account',
  active: 'Active',
  suspended: 'Suspended',
};

const EMPLOYMENT_BADGE: Record<DirectoryRow['employment_status'], 'success' | 'neutral'> = {
  active: 'success',
  terminated: 'neutral',
};

const EMPLOYMENT_LABEL: Record<DirectoryRow['employment_status'], string> = {
  active: 'Employed',
  terminated: 'Terminated',
};

const DEFAULT_PAGE_SIZE = 25;

/** Compact chip list for name collections (groups, accounts, projects) with +N overflow. */
function ChipList({ items }: { items: string[] }) {
  if (items.length === 0) return <span className="text-ink-tertiary">{'—'}</span>;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {items.slice(0, 2).map((label) => (
        <Badge key={label} variant="neutral" label={label} />
      ))}
      {items.length > 2 && (
        <span className="text-caption text-ink-tertiary">+{items.length - 2}</span>
      )}
    </div>
  );
}

interface DirectoryProps {
  search: DirectorySearch;
  onSearch: (next: (prev: DirectorySearch) => DirectorySearch) => void;
}

export function Directory({ search, onSearch }: DirectoryProps) {
  const [selectedRow, setSelectedRow] = useState<DirectoryRow | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<DirectoryRow | null>(null);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const canWrite = usePermission('identity.user.update');

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

  // Work enrichment (department, accounts, projects) joins people projections onto the page rows.
  const personIds = useMemo(() => rows.map((r) => r.person_id), [rows]);
  const { data: briefs = [] } = useWorkersBrief(personIds);
  const briefById = useMemo(() => new Map(briefs.map((b) => [b.worker_id, b])), [briefs]);

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

  function handleSuspendDialogOpenChange(o: boolean) {
    if (!o) setSuspendTarget(null);
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
        header: 'Position',
        cell: ({ row }) => {
          const department = briefById.get(row.original.person_id)?.org_unit_name;
          return (
            <div className="flex min-w-0 flex-col">
              {row.original.job_title ? (
                <span className="truncate">{row.original.job_title}</span>
              ) : (
                <span className="text-ink-tertiary">{'—'}</span>
              )}
              {department && (
                <span className="truncate text-caption text-ink-tertiary">{department}</span>
              )}
            </div>
          );
        },
      },
      {
        id: 'employment_status',
        header: 'Employment',
        enableSorting: false,
        cell: ({ row }) => (
          <Badge
            variant={EMPLOYMENT_BADGE[row.original.employment_status]}
            label={EMPLOYMENT_LABEL[row.original.employment_status]}
          />
        ),
      },
      {
        id: 'account_status',
        header: 'Account status',
        enableSorting: false,
        cell: ({ row }) => (
          <Badge
            variant={ACCOUNT_STATUS_BADGE[row.original.account_status]}
            label={ACCOUNT_STATUS_LABEL[row.original.account_status]}
          />
        ),
      },
      {
        id: 'accounts',
        header: 'Accounts',
        enableSorting: false,
        cell: ({ row }) => (
          <ChipList
            items={(briefById.get(row.original.person_id)?.accounts ?? []).map((a) => a.name)}
          />
        ),
      },
      {
        id: 'projects',
        header: 'Projects',
        enableSorting: false,
        cell: ({ row }) => (
          <ChipList
            items={(briefById.get(row.original.person_id)?.projects ?? []).map((p) => p.name)}
          />
        ),
      },
      {
        id: 'groups',
        header: 'Groups',
        enableSorting: false,
        cell: ({ row }) => <ChipList items={row.original.groups ?? []} />,
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => {
          if (!canWrite) return null;
          const r = row.original;
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: swallows clicks so the trigger doesn't bubble to the row's onClick; the real interactive control is the DropdownMenu's own Button.
            <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              <DropdownMenu
                placement="below"
                button={{
                  variant: 'ghost',
                  size: 'sm',
                  isIconOnly: true,
                  label: `Row actions for ${r.full_name}`,
                  icon: <MoreHorizontal className="size-4" />,
                }}
              >
                {r.account_status === 'none' && (
                  <DropdownMenuItem
                    label="Provision"
                    onClick={() => provision.mutate(r.person_id)}
                  />
                )}
                {r.account_status === 'active' && r.user_id && (
                  <DropdownMenuItem
                    label="Suspend"
                    style={{ color: 'var(--color-destructive)' }}
                    onClick={() => setSuspendTarget(r)}
                  />
                )}
                {r.account_status === 'suspended' && r.user_id && (
                  <DropdownMenuItem
                    label="Reactivate"
                    onClick={() => reactivate.mutate(r.user_id ?? '')}
                  />
                )}
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [canWrite, provision, reactivate, briefById],
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
                onChange={(v) => applyFilter({ group: v === 'all' ? undefined : v })}
                options={groupOptions}
              />
              <FilterSelect
                ariaLabel="Filter by account status"
                value={status}
                onChange={(v) =>
                  applyFilter({
                    status: v === 'all' ? undefined : (v as DirectorySearch['status']),
                  })
                }
                options={STATUS_OPTIONS}
              />
              <FilterSelect
                ariaLabel="Filter by employment"
                value={employment}
                onChange={(v) =>
                  applyFilter({
                    employment: v === 'all' ? undefined : (v as DirectorySearch['employment']),
                  })
                }
                options={EMPLOYMENT_OPTIONS}
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
                  icon={<X className="size-3.5" aria-hidden />}
                  label="Clear"
                />
              )}
            </div>
          }
          right={
            <Input
              label="Search people"
              isLabelHidden
              startIcon={<Search className="size-3.5" aria-hidden />}
              placeholder="Search people…"
              value={qInput}
              onChange={(value) => {
                setQInput(value);
                applyFilter({ q: value.trim() || undefined });
              }}
              className="w-64"
              size="sm"
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

      {/* Suspend confirm dialog. "form" purpose, not "required": this action is recoverable, not
          terminal, and Astryx's `purpose="form"` already blocks backdrop-click dismissal (only
          Escape is allowed) — closer to `"required"`'s risk profile than the name suggests, so
          there's little value in going further. The strongest signal is this file's own history:
          before this migration it used a plain Radix `Dialog` here, never `AlertDialog`, unlike
          `GroupDetail.tsx`'s genuinely terminal group-delete flow (irreversible, deletes roles)
          which *does* use `AlertDialog` in the same package — the original author already judged
          suspend as non-terminal. The copy ("You can reactivate at any time") corroborates that
          judgment but isn't the primary evidence. */}
      <Dialog
        isOpen={suspendTarget !== null}
        onOpenChange={handleSuspendDialogOpenChange}
        purpose="form"
      >
        <Layout
          header={
            <DialogHeader
              title="Suspend account?"
              subtitle={`${suspendTarget?.full_name}'s access will be revoked immediately. You can reactivate at any time.`}
              onOpenChange={handleSuspendDialogOpenChange}
            />
          }
          footer={
            <LayoutFooter hasDivider>
              <Button variant="secondary" label="Cancel" onClick={() => setSuspendTarget(null)} />
              <Button
                variant="destructive"
                label="Suspend"
                onClick={() => {
                  if (suspendTarget?.user_id) suspend.mutate(suspendTarget.user_id);
                  setSuspendTarget(null);
                }}
              />
            </LayoutFooter>
          }
        />
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
