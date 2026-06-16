import type { GroupMemberRow, GroupRow } from '@seta/planner';
import {
  Avatar,
  AvatarFallback,
  Button,
  cn,
  DataTable,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@seta/shared-ui';
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table';
import { useMemo, useState } from 'react';

interface Props {
  group: GroupRow;
  members: ReadonlyArray<GroupMemberRow>;
  canManageRoles: boolean;
  canRemoveMembers: boolean;
  onRoleChange: (input: { user_id: string; role: 'owner' | 'member' }) => void;
  onRemoveMember: (member: GroupMemberRow) => void;
  onRemoveMembers: (userIds: string[]) => void;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

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
      <select
        value={member.role}
        aria-label={`Change role for ${member.display_name}`}
        className="h-8 w-28 rounded border border-hairline bg-canvas px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
        onChange={(e) => onChange(e.target.value as 'owner' | 'member')}
      >
        <option value="owner">Owner</option>
        <option value="member">Member</option>
      </select>
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
      <Tooltip>
        <TooltipTrigger asChild>
          {/* biome-ignore lint/a11y/noNoninteractiveTabindex: tooltip needs keyboard access */}
          <span tabIndex={0}>{pill}</span>
        </TooltipTrigger>
        <TooltipContent>
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
        </TooltipContent>
      </Tooltip>
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

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const selectedIds = useMemo(
    () =>
      Object.entries(rowSelection)
        .filter(([, selected]) => selected)
        .map(([idx]) => members[Number(idx)]?.user_id)
        .filter((id): id is string => !!id),
    [rowSelection, members],
  );

  const columns = useMemo<ColumnDef<GroupMemberRow>[]>(
    () => [
      {
        accessorKey: 'display_name',
        header: 'Member',
        cell: ({ row }) => (
          <div className="flex items-center gap-2.5">
            <Avatar className="size-8 shrink-0">
              <AvatarFallback className="text-[11px] font-semibold">
                {initials(row.original.display_name)}
              </AvatarFallback>
            </Avatar>
            <span className="font-medium text-ink">{row.original.display_name}</span>
          </div>
        ),
      },
      {
        accessorKey: 'email',
        header: 'Email',
        cell: ({ getValue }) => <span className="text-ink-subtle">{String(getValue() ?? '')}</span>,
      },
      {
        accessorKey: 'role',
        header: 'Role',
        enableSorting: false,
        cell: ({ row }) => (
          <RoleControl
            member={row.original}
            canEdit={canEditRoles}
            isLinkedGroup={isLinkedGroup}
            externalId={externalId}
            onChange={(role) => onRoleChange({ user_id: row.original.user_id, role })}
          />
        ),
      },
      {
        accessorKey: 'added_at',
        header: 'Added',
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap text-ink-subtle">
            {shortDate(String(getValue() ?? ''))}
          </span>
        ),
      },
      ...(canRemove
        ? ([
            {
              id: 'actions',
              header: () => null,
              enableSorting: false,
              enableHiding: false,
              cell: ({ row }) => (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveMember(row.original);
                  }}
                >
                  Remove
                </Button>
              ),
            },
          ] as ColumnDef<GroupMemberRow>[])
        : []),
    ],
    [canEditRoles, canRemove, isLinkedGroup, externalId, onRoleChange, onRemoveMember],
  );

  return (
    <TooltipProvider>
      <section className="rounded-lg border border-hairline bg-canvas overflow-hidden">
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-3 border-b border-hairline bg-surface-1 px-4 py-2">
            <span className="text-body-sm text-ink-subtle">
              {selectedIds.length} {selectedIds.length === 1 ? 'member' : 'members'} selected
            </span>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                onRemoveMembers(selectedIds);
                setRowSelection({});
              }}
            >
              Remove selected
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRowSelection({})}>
              Clear selection
            </Button>
          </div>
        )}
        <div className="[&_>div]:space-y-0 [&_>div>div:first-child]:px-4 [&_>div>div:first-child]:pt-3 [&_>div>div:first-child]:pb-3 [&_>div>div:first-child]:border-b [&_>div>div:first-child]:border-hairline">
          <DataTable
            mode="client"
            data={members as GroupMemberRow[]}
            columns={columns}
            enableGlobalFilter
            globalFilterPlaceholder="Search members…"
            enableColumnVisibility={false}
            density="comfortable"
            pagination={{ defaultPageSize: 20, pageSizeOptions: [20, 50, 100] }}
            enableRowSelection={canRemove}
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
            emptyState={
              <div className="px-4 py-12 text-center text-body-sm text-ink-subtle">
                No members in this group yet.
              </div>
            }
          />
        </div>
      </section>
    </TooltipProvider>
  );
}
