import {
  Badge,
  Button,
  Dialog,
  DialogFooter,
  DialogHeader,
  DropdownMenu,
  DropdownMenuItem,
  EmptyState,
  HStack,
  Input,
  Layout,
  pixel,
  proportional,
  Selector,
  Skeleton,
  Table,
  type TableColumn,
  Text,
  Toolbar,
  useTablePagination,
  useTableSelection,
  VStack,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { MoreHorizontal, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminPageFrame } from '../../components/AdminPageFrame.tsx';
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

// Astryx Table columns require `T extends Record<string, unknown>`; the DTO
// lacks an index signature, so alias locally (do not touch the shared DTO).
type DirectoryTableRow = DirectoryRow & Record<string, unknown>;

/** Compact chip list for name collections (groups, accounts, projects) with +N overflow. */
function ChipList({ items }: { items: string[] }) {
  if (items.length === 0) return <Text color="disabled">{'—'}</Text>;
  return (
    <HStack gap={1} vAlign="center" wrap="wrap">
      {items.slice(0, 2).map((label) => (
        <Badge key={label} variant="neutral" label={label} />
      ))}
      {items.length > 2 && (
        <Text type="supporting" color="disabled">
          +{items.length - 2}
        </Text>
      )}
    </HStack>
  );
}

interface DirectoryProps {
  search: DirectorySearch;
  onSearch: (next: (prev: DirectorySearch) => DirectorySearch) => void;
}

export function Directory({ search, onSearch }: DirectoryProps) {
  const [selectedRow, setSelectedRow] = useState<DirectoryRow | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<DirectoryRow | null>(null);

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

  const rows = (data?.rows ?? []) as DirectoryTableRow[];

  // Work enrichment (department, accounts, projects) joins people projections onto the page rows.
  const personIds = useMemo(() => rows.map((r) => r.person_id), [rows]);
  const { data: briefs = [] } = useWorkersBrief(personIds);
  const briefById = useMemo(() => new Map(briefs.map((b) => [b.worker_id, b])), [briefs]);

  // Only account-holding rows are selectable (a 'none' row has no user_id).
  const selectableRows = useMemo(() => rows.filter((r) => r.account_status !== 'none'), [rows]);

  // Accumulator: person_id → user_id, surviving pagination. This durable
  // cross-page map is the single source of truth for the checkboxes; the
  // selection plugin reads it via getIsItemSelected.
  const [selectedUsers, setSelectedUsers] = useState<Record<string, string>>({});

  // Select adds person_id→user_id, deselect removes it.
  const handleRowToggle = useCallback((row: DirectoryTableRow, isSelected: boolean) => {
    setSelectedUsers((acc) => {
      const next = { ...acc };
      if (isSelected) {
        if (row.user_id) next[row.person_id] = row.user_id;
      } else {
        delete next[row.person_id];
      }
      return next;
    });
  }, []);

  // Select-all operates on the current page's selectable rows only.
  const handleSelectAllOnPage = useCallback(
    (selectAll: boolean) => {
      setSelectedUsers((acc) => {
        const next = { ...acc };
        for (const r of selectableRows) {
          if (selectAll) {
            if (r.user_id) next[r.person_id] = r.user_id;
          } else {
            delete next[r.person_id];
          }
        }
        return next;
      });
    },
    [selectableRows],
  );

  const selectedUserIds = useMemo(() => Object.values(selectedUsers), [selectedUsers]);

  function clearSelection() {
    setSelectedUsers({});
  }

  function handleSuspendDialogOpenChange(o: boolean) {
    if (!o) setSuspendTarget(null);
  }

  const rowCount = data?.total ?? 0;

  const columns = useMemo<TableColumn<DirectoryTableRow>[]>(
    () => [
      {
        key: 'full_name',
        header: 'Name',
        width: proportional(2),
        renderCell: (r) => (
          <HStack gap={2} vAlign="center">
            <PersonAvatar name={r.full_name} />
            <VStack gap={0} className="min-w-0">
              <Text weight="medium" className="truncate">
                {r.full_name}
              </Text>
              {r.work_email && (
                <Text type="supporting" color="disabled" className="truncate">
                  {r.work_email}
                </Text>
              )}
            </VStack>
          </HStack>
        ),
      },
      {
        key: 'job_title',
        header: 'Position',
        width: proportional(2),
        renderCell: (r) => {
          const department = briefById.get(r.person_id)?.org_unit_name;
          return (
            <VStack gap={0} className="min-w-0">
              {r.job_title ? (
                <Text className="truncate">{r.job_title}</Text>
              ) : (
                <Text color="disabled">{'—'}</Text>
              )}
              {department && (
                <Text type="supporting" color="disabled" className="truncate">
                  {department}
                </Text>
              )}
            </VStack>
          );
        },
      },
      {
        key: 'employment_status',
        header: 'Employment',
        width: pixel(140),
        renderCell: (r) => (
          <Badge
            variant={EMPLOYMENT_BADGE[r.employment_status]}
            label={EMPLOYMENT_LABEL[r.employment_status]}
          />
        ),
      },
      {
        key: 'account_status',
        header: 'Account status',
        width: pixel(140),
        renderCell: (r) => (
          <Badge
            variant={ACCOUNT_STATUS_BADGE[r.account_status]}
            label={ACCOUNT_STATUS_LABEL[r.account_status]}
          />
        ),
      },
      {
        key: 'accounts',
        header: 'Accounts',
        width: proportional(1),
        renderCell: (r) => (
          <ChipList items={(briefById.get(r.person_id)?.accounts ?? []).map((a) => a.name)} />
        ),
      },
      {
        key: 'projects',
        header: 'Projects',
        width: proportional(1),
        renderCell: (r) => (
          <ChipList items={(briefById.get(r.person_id)?.projects ?? []).map((p) => p.name)} />
        ),
      },
      {
        key: 'groups',
        header: 'Groups',
        width: proportional(1),
        renderCell: (r) => <ChipList items={r.groups ?? []} />,
      },
      {
        key: 'actions',
        header: '',
        width: pixel(56),
        align: 'end',
        renderCell: (r) => {
          if (!canWrite) return null;
          return (
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
                <DropdownMenuItem label="Provision" onClick={() => provision.mutate(r.person_id)} />
              )}
              {r.account_status === 'active' && r.user_id && (
                <DropdownMenuItem
                  label="Suspend"
                  style={{ color: 'var(--color-error)' }}
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
          );
        },
      },
    ],
    [canWrite, provision, reactivate, briefById],
  );

  const pagination = useTablePagination<DirectoryTableRow>({
    page: page + 1, // URL state is 0-based; the Astryx pager is 1-based.
    onPageChange: (p) => setPage(p - 1),
    totalItems: rowCount,
    pageSize,
    onPageSizeChange: setPageSize,
    pageSizeOptions: [10, 25, 50, 100],
  });

  const selection = useTableSelection<DirectoryTableRow>({
    getIsItemSelected: (r) => !!selectedUsers[r.person_id],
    onSelectItem: ({ item, isSelected }) => handleRowToggle(item, isSelected),
    onSelectAll: ({ isAllSelected }) => handleSelectAllOnPage(isAllSelected),
    getIsAllSelected: () =>
      selectableRows.length > 0 && selectableRows.every((r) => !!selectedUsers[r.person_id]),
    getIsIndeterminate: () =>
      selectableRows.some((r) => !!selectedUsers[r.person_id]) &&
      !selectableRows.every((r) => !!selectedUsers[r.person_id]),
    getIsItemEnabled: (r) => r.account_status !== 'none',
  });

  const subtitle = isLoading
    ? 'Loading…'
    : data
      ? `${rowCount.toLocaleString()} ${rowCount === 1 ? 'person' : 'people'}`
      : undefined;

  return (
    <AdminPageFrame
      crumb="Directory"
      title="Directory"
      subtitle={subtitle}
      isFullWidth
      subheader={
        <Toolbar
          label="Directory filters"
          size="sm"
          dividers={['bottom']}
          startContent={
            <HStack gap={2} vAlign="center" wrap="wrap">
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
                  style={{ color: 'var(--color-text-secondary)' }}
                  onClick={() => {
                    setQInput('');
                    onSearch(() => ({}));
                  }}
                  icon={<X className="size-3.5" aria-hidden />}
                  label="Clear"
                />
              )}
            </HStack>
          }
          endContent={
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
              width={256}
              size="sm"
            />
          }
        />
      }
    >
      {canWrite && selectedUserIds.length > 0 && (
        <BulkGroupBar selectedUserIds={selectedUserIds} onClearSelection={clearSelection} />
      )}
      {isLoading ? (
        <VStack gap={2}>
          {['s0', 's1', 's2', 's3', 's4'].map((id) => (
            <Skeleton key={id} height={44} />
          ))}
        </VStack>
      ) : (
        <Table
          data={rows}
          columns={columns}
          idKey="person_id"
          emptyState={<EmptyState title="No results" />}
          plugins={{
            selection,
            pagination,
            // Row click opens the detail sheet. Guard against clicks that
            // originate from the row's own interactive controls (selection
            // checkbox, the actions menu trigger) so they don't also
            // navigate — the deleted DataTable did this via stopPropagation.
            rowClick: {
              transformBodyRow: (props, item) => ({
                ...props,
                htmlProps: {
                  ...props.htmlProps,
                  style: { ...props.htmlProps.style, cursor: 'pointer' },
                  onClick: (e) => {
                    const target = e.target as HTMLElement;
                    if (
                      target.closest(
                        'button, a, input, label, [role="checkbox"], [role="menuitem"]',
                      )
                    )
                      return;
                    setSelectedRow(item);
                  },
                },
              }),
            },
          }}
        />
      )}

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
            <DialogFooter>
              <Button variant="secondary" label="Cancel" onClick={() => setSuspendTarget(null)} />
              <Button
                variant="destructive"
                label="Suspend"
                onClick={() => {
                  if (suspendTarget?.user_id) suspend.mutate(suspendTarget.user_id);
                  setSuspendTarget(null);
                }}
              />
            </DialogFooter>
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
    </AdminPageFrame>
  );
}
