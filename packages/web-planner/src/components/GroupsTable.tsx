import type { GroupWithCountsRow } from '@seta/planner';
import {
  Avatar,
  AvatarStack,
  Badge,
  Button,
  DisabledActionTooltip,
  EmptyState,
  formatRelative,
  GroupTile,
  pixel,
  proportional,
  Table,
  type TableColumn,
  type TableSortState,
  useTableSortable,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { Link, useNavigate } from '@tanstack/react-router';
import { RefreshCw, Shield, Users } from 'lucide-react';
import { PERMISSION_DENIED } from '../lib/permission-messages';

export type GroupSortField = 'group' | 'owner' | 'plans' | 'members' | 'visibility' | 'activity';
export interface GroupSort {
  field: GroupSortField;
  dir: 'asc' | 'desc';
}

// Astryx Table columns require `T extends Record<string, unknown>`; the DTO lacks an
// index signature, so alias locally (do not touch the shared DTO).
type GroupRow = GroupWithCountsRow & Record<string, unknown>;

interface Props {
  groups: ReadonlyArray<GroupWithCountsRow>;
  onRestore?: (groupId: string) => void;
  sort: GroupSort;
  onSortChange: (next: GroupSort) => void;
}

export function GroupsTable({ groups, onRestore, sort, onSortChange }: Props) {
  const canUpdateGroup = usePermission('planner.group.update');
  const navigate = useNavigate();

  const sortState: TableSortState = [
    { sortKey: sort.field, direction: sort.dir === 'desc' ? 'descending' : 'ascending' },
  ];
  const sortable = useTableSortable<GroupRow>({
    sort: sortState,
    onSortChange: (s) => {
      const entry = s[0];
      // Sorting is single-column; clearing sort falls back to the default group order.
      if (!entry) {
        onSortChange({ field: 'group', dir: 'asc' });
        return;
      }
      onSortChange({
        field: entry.sortKey as GroupSortField,
        dir: entry.direction === 'descending' ? 'desc' : 'asc',
      });
    },
  });

  const columns: TableColumn<GroupRow>[] = [
    {
      key: 'group',
      header: 'Group',
      width: proportional(2.4, { minWidth: 240 }),
      sortable: true,
      renderCell: (g) => (
        <div className="flex min-w-0 items-center gap-3">
          <GroupTile size={28} theme={g.theme} name={g.name} />
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              {/* Real anchor so ⌘/middle-click and keyboard focus keep working; the row's own
                  onClick still navigates on a plain click, so stop propagation to avoid a
                  double navigation. */}
              <Link
                to="/planner/groups/$groupId"
                params={{ groupId: g.id }}
                aria-label={g.name}
                onClick={(e) => e.stopPropagation()}
                className="truncate font-medium text-primary hover:underline"
              >
                {g.name}
              </Link>
              {g.deleted_at && <Badge variant="neutral" label="Archived" />}
              {g.external_source !== 'native' && (
                <span
                  role="img"
                  aria-label="Synced from M365"
                  title="Synced from IdP"
                  className="inline-flex items-center text-blue-vivid"
                >
                  <RefreshCw className="size-3" aria-hidden="true" />
                </span>
              )}
            </div>
            {g.description && (
              <div className="truncate text-xs text-secondary">{g.description}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'owner',
      header: 'Owner',
      width: proportional(1.4, { minWidth: 160 }),
      sortable: true,
      renderCell: (g) => (
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={g.owner_display_name ?? undefined} size={24} />
          <span className="truncate text-secondary">{g.owner_display_name ?? '—'}</span>
        </div>
      ),
    },
    {
      key: 'plans',
      header: 'Plans',
      width: pixel(80),
      align: 'end',
      sortable: true,
      renderCell: (g) => <span className="font-mono tabular-nums">{g.plan_count}</span>,
    },
    {
      key: 'members',
      header: 'Members',
      width: pixel(140),
      sortable: true,
      renderCell: (g) => (
        <div className="flex items-center gap-2">
          <AvatarStack assignees={g.members_preview} max={3} />
          <span className="text-secondary">{g.member_count}</span>
        </div>
      ),
    },
    {
      key: 'visibility',
      header: 'Visibility',
      width: pixel(130),
      sortable: true,
      renderCell: (g) =>
        g.visibility === 'private' ? (
          <span className="flex items-center gap-1.5 text-secondary">
            <Shield className="size-3.5 shrink-0" aria-hidden="true" />
            Private
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-secondary">
            <Users className="size-3.5 shrink-0" aria-hidden="true" />
            Workspace
          </span>
        ),
    },
    {
      key: 'activity',
      header: 'Activity',
      width: pixel(110),
      align: 'end',
      sortable: true,
      renderCell: (g) => <span className="text-secondary">{formatRelative(g.updated_at)}</span>,
    },
    {
      key: 'action',
      header: '',
      width: pixel(96),
      align: 'end',
      renderCell: (g) =>
        onRestore && g.deleted_at ? (
          <DisabledActionTooltip
            disabled={!canUpdateGroup}
            reason={PERMISSION_DENIED.group.restore}
          >
            <Button
              size="sm"
              variant="secondary"
              label="Restore"
              isDisabled={!canUpdateGroup}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRestore(g.id);
              }}
            />
          </DisabledActionTooltip>
        ) : null,
    },
  ];

  return (
    <Table
      data={[...groups] as GroupRow[]}
      columns={columns}
      idKey="id"
      density="compact"
      plugins={{
        sortable,
        rowClick: {
          transformBodyRow: (props, item) => ({
            ...props,
            htmlProps: {
              ...props.htmlProps,
              style: { ...props.htmlProps.style, cursor: 'pointer' },
              onClick: () =>
                void navigate({ to: '/planner/groups/$groupId', params: { groupId: item.id } }),
            },
          }),
        },
      }}
      emptyState={
        <EmptyState
          icon={<Users className="size-6" />}
          title="No matching groups"
          description="Try adjusting your search or filters."
        />
      }
    />
  );
}
