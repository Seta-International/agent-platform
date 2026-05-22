import type { GroupRow } from '@seta/planner';
import type { SyncState } from '@seta/shared-ui';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  GroupTile,
  SyncBadge,
} from '@seta/shared-ui';
import { Link } from '@tanstack/react-router';
import {
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Plus,
  Shield,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { useRefreshGroupSync } from '../hooks/mutations/refresh-group-sync';
import { useGroupSyncStatus } from '../hooks/queries/use-group-sync-status';
import { useGroupSyncStream } from '../hooks/queries/use-group-sync-stream';
import { LinkToM365Dialog } from './LinkToM365Dialog';
import { ResolveConflictDialog } from './ResolveConflictDialog';
import { SyncControlsMenu } from './SyncControlsMenu';

interface Props {
  group: GroupRow;
  canManage: boolean;
  onRenameClick: () => void;
  onInviteClick: () => void;
  onCreatePlanClick: () => void;
  onMenuAction: (action: 'archive' | 'delete') => void;
}

const createdDateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' });

function formatCreatedDate(dateStr: string): string {
  return createdDateFmt.format(new Date(dateStr));
}

function toSyncBadgeState(status: string | null | undefined): SyncState | null {
  if (!status || status === 'pushing') return null; // SyncBadge has no pushing variant; hide during outbound sync
  if (status === 'idle' || status === 'pulling' || status === 'error' || status === 'conflict') {
    return status as SyncState;
  }
  return null;
}

export function GroupDetailHeader({
  group,
  canManage,
  onRenameClick,
  onInviteClick,
  onCreatePlanClick,
  onMenuAction,
}: Props) {
  const formattedDate = formatCreatedDate(group.created_at);
  const [linkOpen, setLinkOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);

  const syncStatusQuery = useGroupSyncStatus(group.id);
  useGroupSyncStream(group.id);

  const isLinked = group.external_source !== 'native';
  const syncData = syncStatusQuery.data;
  const rawSyncStatus = syncData && 'sync_status' in syncData ? syncData.sync_status : null;
  const syncedAt = syncData && 'synced_at' in syncData ? syncData.synced_at : null;
  const badgeState = isLinked ? toSyncBadgeState(rawSyncStatus) : null;
  const refresh = useRefreshGroupSync(group.id);

  return (
    <>
      <div className="border-b border-hairline px-7 pt-4 pb-0">
        {/* Breadcrumb row */}
        <div className="mb-3 flex items-center gap-2 text-xs text-ink-subtle">
          <Link
            to="/planner/groups"
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-surface-1"
          >
            <ChevronLeft className="size-3" />
            Back to Groups
          </Link>
          <span>·</span>
          <span>
            Planner <ChevronRight className="inline size-2.5 text-ink-tertiary" />{' '}
            <span className="text-primary">Groups</span>
          </span>
        </div>

        {/* Main row */}
        <div className="flex items-start gap-4 pb-4">
          {/* Left: group tile */}
          <GroupTile name={group.name} theme={group.theme} size={48} />

          {/* Middle: name + metadata */}
          <div className="flex-1 min-w-0">
            {/* Line 1: title + rename + visibility */}
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-card-title font-semibold">{group.name}</h1>
              {canManage && (
                <button
                  type="button"
                  aria-label="Rename group"
                  className="rounded p-0.5 text-ink-subtle hover:bg-surface-1 hover:text-ink"
                  onClick={onRenameClick}
                >
                  <Pencil className="size-3.5" />
                </button>
              )}
              {/* Visibility pill */}
              <span className="inline-flex h-5 items-center gap-1.5 rounded-full bg-surface-1 px-2 text-xs">
                {group.visibility === 'private' ? (
                  <>
                    <Shield className="size-3 text-ink-subtle" aria-hidden="true" />
                    Private
                  </>
                ) : (
                  <>
                    <Users className="size-3 text-ink-subtle" aria-hidden="true" />
                    Workspace
                  </>
                )}
              </span>
            </div>

            {/* Line 2: description + created date + sync badge */}
            <div className="mt-1 flex items-center gap-2 text-body-sm text-ink-subtle">
              <span>{group.description ?? '—'}</span>
              <span>·</span>
              <span>Created {formattedDate}</span>
              {isLinked && (
                <>
                  <span>·</span>
                  {badgeState === 'error' ? (
                    <button
                      type="button"
                      className="inline-flex items-center"
                      onClick={() => refresh.mutate()}
                      disabled={refresh.isPending}
                    >
                      <SyncBadge state="error" synced_at={syncedAt ?? null} />
                    </button>
                  ) : badgeState === 'conflict' ? (
                    <button
                      type="button"
                      className="inline-flex items-center"
                      onClick={() => setResolveOpen(true)}
                    >
                      <SyncBadge state="conflict" synced_at={syncedAt ?? null} />
                    </button>
                  ) : (
                    <SyncBadge state={badgeState} synced_at={syncedAt ?? null} />
                  )}
                </>
              )}
            </div>
          </div>

          {/* Right: action buttons */}
          <div className="flex-shrink-0 flex items-center gap-2">
            {canManage && (
              <Button size="sm" variant="secondary" onClick={onInviteClick}>
                <Users className="size-3" />
                Invite
              </Button>
            )}
            <Button size="sm" onClick={onCreatePlanClick}>
              <Plus className="size-3" />
              New plan
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="More actions"
                  className="inline-flex items-center justify-center rounded p-1 text-ink-subtle hover:bg-surface-1 hover:text-ink"
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <SyncControlsMenu
                  groupId={group.id}
                  externalSource={group.external_source}
                  syncStatus={rawSyncStatus}
                  canManage={canManage}
                  onLinkClick={() => setLinkOpen(true)}
                  onResolveClick={() => setResolveOpen(true)}
                  onRefreshClick={() => refresh.mutate()}
                  isRefreshing={refresh.isPending}
                />
                <DropdownMenuItem onSelect={() => onMenuAction('archive')}>
                  Archive
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => onMenuAction('delete')}
                  className="text-semantic-danger"
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <LinkToM365Dialog groupId={group.id} open={linkOpen} onOpenChange={setLinkOpen} />
      <ResolveConflictDialog
        groupId={group.id}
        conflictFields={[]}
        open={resolveOpen}
        onOpenChange={setResolveOpen}
      />
    </>
  );
}
