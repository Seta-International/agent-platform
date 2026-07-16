import type { GroupMemberRow, GroupRow } from '@seta/planner';
import {
  Avatar,
  Button,
  cn,
  EmptyState,
  HoverCard,
  Input,
  paginateData,
  Selector,
  Table,
  type TableColumn,
  useTablePagination,
  useTableSelection,
  useTableSelectionState,
  useTableSortable,
  useTableSortableState,
} from '@seta/shared-ui';
import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

// Astryx Table columns require `T extends Record<string, unknown>`; alias the
// DTO locally rather than modifying the shared type.
type Row = GroupMemberRow & Record<string, unknown>;

interface Props {
  group: GroupRow;
  members: ReadonlyArray<GroupMemberRow>;
  canManageRoles: boolean;
  canRemoveMembers: boolean;
  onRoleChange: (input: { user_id: string; role: 'owner' | 'member' }) => void;
  onRemoveMember: (member: GroupMemberRow) => void;
  onRemoveMembers: (userIds: string[]) => void;
}

const PAGE_SIZE_OPTIONS = [20, 50, 100];

const shortDateFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function shortDate(iso: string): string {
  return shortDateFmt.format(new Date(iso));
}

interface RoleControlProps {
  member: GroupMemberRow;
  canEdit: boolean;
  isLinkedGroup: boolean;
  externalId: string | null;
  onChange: (role: 'owner' | 'member') => void;
}

function RoleControl({ member, canEdit, isLinkedGroup, externalId, onChange }: RoleControlProps) {
  if (canEdit) {
    return (
      <Selector
        label={`Change role for ${member.display_name}`}
        isLabelHidden
        options={[
          { value: 'owner', label: 'Owner' },
          { value: 'member', label: 'Member' },
        ]}
        value={member.role}
        onChange={(v) => onChange(v as 'owner' | 'member')}
      />
    );
  }

  const pill = (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-full px-2 text-xs',
        member.role === 'owner'
          ? 'bg-primary-tint text-primary-ink'
          : 'bg-surface-2 text-ink-muted',
      )}
    >
      {member.role === 'owner' ? 'Owner' : 'Member'}
    </span>
  );

  if (isLinkedGroup) {
    return (
      <HoverCard
        content={
          <>
            <p>Managed in Microsoft 365</p>
            {externalId && (
              <a
                href={`https://entra.microsoft.com/#view/Microsoft_AAD_IAM/GroupDetailsMenuBlade/~/Overview/groupId/${externalId}`}
                target="_blank"
                rel="noreferrer"
                className="mt-0.5 block text-xs underline"
              >
                Open in Azure portal
              </a>
            )}
          </>
        }
        hasHoverIndication={false}
      >
        {/* biome-ignore lint/a11y/noNoninteractiveTabindex: hover card needs keyboard access */}
        <span tabIndex={0}>{pill}</span>
      </HoverCard>
    );
  }

  return pill;
}

export function GroupMembersTable({
  group,
  members,
  canManageRoles,
  canRemoveMembers,
  onRoleChange,
  onRemoveMember,
  onRemoveMembers,
}: Props) {
  const canEditRoles = canManageRoles && group.external_source === 'native';
  const canRemove = canRemoveMembers && group.external_source === 'native';
  const isLinkedGroup = group.external_source !== 'native';
  const externalId = group.external_id;

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const rows = members as Row[];

  // Consumer-owned global filter over the fields actually shown to the user
  // (name/email/role label/formatted date) — case-insensitive substring match.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((m) => {
      const roleLabel = m.role === 'owner' ? 'Owner' : 'Member';
      return (
        m.display_name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        roleLabel.toLowerCase().includes(q) ||
        shortDate(m.added_at).toLowerCase().includes(q)
      );
    });
  }, [rows, search]);

  const { sortedData, sort, sortConfig } = useTableSortableState<Row>({ data: filtered });
  const sortable = useTableSortable<Row>(sortConfig);

  // Reset to page 1 on sort change — old TanStack autoResetPageIndex parity (see candidates-page).
  // The search filter already resets page inline in its own onChange handler above.
  // biome-ignore lint/correctness/useExhaustiveDependencies: sort is the intentional reset trigger, unread in the body.
  useEffect(() => {
    setPage(1);
  }, [sort]);

  const pageRows = paginateData(sortedData, page, pageSize);

  const pagination = useTablePagination<Row>({
    page,
    onPageChange: setPage,
    totalItems: sortedData.length,
    pageSize,
    onPageSizeChange: (size) => {
      setPageSize(size);
      setPage(1);
    },
    pageSizeOptions: PAGE_SIZE_OPTIONS,
  });

  const { selectionConfig } = useTableSelectionState<Row>({
    data: pageRows,
    idKey: 'user_id',
    selectedKeys,
    setSelectedKeys,
  });
  const selection = useTableSelection<Row>(selectionConfig);

  const selectedIds = useMemo(() => [...selectedKeys], [selectedKeys]);

  const columns = useMemo<TableColumn<Row>[]>(
    () => [
      {
        key: 'display_name',
        header: 'Member',
        sortable: true,
        renderCell: (m) => (
          <div className="flex items-center gap-2.5">
            <Avatar name={m.display_name} size={32} />
            <span className="font-medium text-ink">{m.display_name}</span>
          </div>
        ),
      },
      {
        key: 'email',
        header: 'Email',
        sortable: true,
        renderCell: (m) => <span className="text-ink-subtle">{m.email}</span>,
      },
      {
        key: 'role',
        header: 'Role',
        renderCell: (m) => (
          <RoleControl
            member={m}
            canEdit={canEditRoles}
            isLinkedGroup={isLinkedGroup}
            externalId={externalId}
            onChange={(role) => onRoleChange({ user_id: m.user_id, role })}
          />
        ),
      },
      {
        key: 'added_at',
        header: 'Added',
        sortable: true,
        renderCell: (m) => (
          <span className="whitespace-nowrap text-ink-subtle">{shortDate(m.added_at)}</span>
        ),
      },
      ...(canRemove
        ? ([
            {
              key: 'actions',
              header: '',
              renderCell: (m) => (
                <Button
                  variant="ghost"
                  size="sm"
                  label="Remove"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveMember(m);
                  }}
                />
              ),
            },
          ] satisfies TableColumn<Row>[])
        : []),
    ],
    [canEditRoles, canRemove, isLinkedGroup, externalId, onRoleChange, onRemoveMember],
  );

  return (
    <section className="rounded-lg border border-hairline bg-canvas overflow-hidden">
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-3 border-b border-hairline bg-surface-1 px-4 py-2">
          <span className="text-body-sm text-ink-subtle">
            {selectedIds.length} {selectedIds.length === 1 ? 'member' : 'members'} selected
          </span>
          <Button
            variant="destructive"
            size="sm"
            label="Remove selected"
            onClick={() => {
              onRemoveMembers(selectedIds);
              setSelectedKeys(new Set());
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            label="Clear selection"
            onClick={() => setSelectedKeys(new Set())}
          />
        </div>
      )}
      <div className="space-y-0 px-4 pt-3 pb-3 border-b border-hairline">
        <Input
          label="Search members"
          isLabelHidden
          startIcon={<Search className="size-3.5" aria-hidden />}
          placeholder="Search members…"
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          className="max-w-sm"
        />
      </div>
      <Table
        data={pageRows}
        columns={columns}
        idKey="user_id"
        density="balanced"
        plugins={{ pagination, sortable, ...(canRemove ? { selection } : {}) }}
        emptyState={
          search.trim() ? (
            <EmptyState
              title="No results match these filters"
              description="Try removing a filter or clearing your search."
              action={{ label: 'Clear filters', onClick: () => setSearch('') }}
            />
          ) : (
            <div className="px-4 py-12 text-center text-body-sm text-ink-subtle">
              No members in this group yet.
            </div>
          )
        }
      />
    </section>
  );
}
