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
import { ChevronRight, MoreHorizontal, Pencil, Plus, Shield, Users } from 'lucide-react';
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
  onEditClick: () => void;
  onInviteClick: () => void;
  onCreatePlanClick: () => void;
  onMenuAction: (action: 'archive' | 'delete') => void;
}

function toSyncBadgeState(status: string | null | undefined): SyncState | null {
  if (!status || status === 'pushing') return null;
  if (status === 'idle' || status === 'pulling' || status === 'error' || status === 'conflict') {
    return status as SyncState;
  }
  return null;
}

export function GroupDetailHeader({
  group,
  canManage,
  onEditClick,
  onInviteClick,
  onCreatePlanClick,
  onMenuAction,
}: Props) {
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

  const breadcrumb = [
    { label: 'Planner', to: '/planner/groups' as const },
    { label: 'Groups', to: '/planner/groups' as const },
  ] as const;

  return (
    <>
      <header className="flex h-14 flex-none items-center justify-between gap-4 border-b border-hairline bg-canvas px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex-none">
            <GroupTile name={group.name} theme={group.theme} size={32} />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-1.5 text-eyebrow uppercase tracking-[0.04em] text-ink-subtle"
            >
              {breadcrumb.map((crumb, i) => (
                <span key={crumb.label} className="flex items-center gap-1.5">
                  {i > 0 && <ChevronRight aria-hidden className="size-2.5 text-ink-tertiary" />}
                  <Link
                    to={crumb.to}
                    className="rounded px-1 py-0.5 hover:bg-surface-1 hover:text-ink"
                  >
                    {crumb.label}
                  </Link>
                </span>
              ))}
            </nav>
            <div className="flex min-w-0 items-baseline gap-3">
              <h1 className="text-card-title m-0 truncate font-semibold tracking-tight text-ink">
                {group.name}
              </h1>
              <div className="flex min-w-0 flex-none items-center gap-2 text-body-sm text-ink-subtle">
                {canManage && !group.deleted_at && (
                  <button
                    type="button"
                    aria-label="Edit group"
                    className="rounded p-0.5 text-ink-subtle hover:bg-surface-1 hover:text-ink"
                    onClick={onEditClick}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                )}
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
                {group.description && (
                  <span className="truncate">
                    <span aria-hidden="true">·</span> {group.description}
                  </span>
                )}
                {isLinked && badgeState && (
                  <>
                    <span aria-hidden="true">·</span>
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
          </div>
        </div>
        <div className="flex flex-none items-center gap-2">
          {canManage && !group.deleted_at && (
            <Button size="sm" variant="secondary" onClick={onInviteClick}>
              <Users className="size-3" />
              Invite
            </Button>
          )}
          {!group.deleted_at && (
            <Button size="sm" onClick={onCreatePlanClick}>
              <Plus className="size-3" />
              New plan
            </Button>
          )}
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
              <DropdownMenuItem onSelect={() => onMenuAction('archive')}>Archive</DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => onMenuAction('delete')}
                className="text-semantic-danger"
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      {isLinked && (
        <div
          data-testid="m365-auto-mirror-info"
          className="flex-none border-b border-hairline bg-surface-1 px-6 py-2 text-body-sm text-ink-subtle"
        >
          Plans in this group are mirrored to and from M365 Planner automatically. Native plans you
          create here will be pushed to M365 as new Planner plans.
        </div>
      )}

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
