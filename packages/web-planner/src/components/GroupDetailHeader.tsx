import type { GroupRow } from '@seta/planner';
import type { SyncState } from '@seta/shared-ui';
import {
  BreadcrumbItem,
  Breadcrumbs,
  Button,
  DisabledActionTooltip,
  DropdownMenu,
  DropdownMenuItem,
  GroupTile,
  Heading,
  IconButton,
  SyncBadge,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { MoreHorizontal, Pencil, Plus, Shield, Users } from 'lucide-react';
import { useState } from 'react';
import { useRefreshGroupSync } from '../hooks/mutations/refresh-group-sync';
import { useGroupSyncStatus } from '../hooks/queries/use-group-sync-status';
import { useGroupSyncStream } from '../hooks/queries/use-group-sync-stream';
import { PERMISSION_DENIED } from '../lib/permission-messages';
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

  const canCreatePlan = usePermission('planner.plan.create');
  const canUpdateGroup = usePermission('planner.group.update');
  const canDeleteGroup = usePermission('planner.group.delete');

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
      <header className="flex h-14 flex-none items-center justify-between gap-4 border-b border-border bg-body px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex-none">
            <GroupTile name={group.name} theme={group.theme} size={32} />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <Breadcrumbs variant="supporting">
              <BreadcrumbItem href="/planner">Planner</BreadcrumbItem>
              <BreadcrumbItem href="/planner/groups">Groups</BreadcrumbItem>
              <BreadcrumbItem isCurrent>{group.name}</BreadcrumbItem>
            </Breadcrumbs>
            <div className="flex min-w-0 items-baseline gap-3">
              <Heading level={1} maxLines={1}>
                {group.name}
              </Heading>
              <div className="flex min-w-0 items-center gap-2 text-body-sm text-secondary">
                {!group.deleted_at && (
                  <DisabledActionTooltip
                    disabled={!canUpdateGroup}
                    reason={PERMISSION_DENIED.group.edit}
                  >
                    <IconButton
                      variant="ghost"
                      size="sm"
                      label="Edit group"
                      onClick={onEditClick}
                      isDisabled={!canUpdateGroup}
                      icon={<Pencil className="size-3.5" />}
                    />
                  </DisabledActionTooltip>
                )}
                <span className="inline-flex h-5 flex-none items-center gap-1.5 rounded-full bg-card px-2 text-xs">
                  {group.visibility === 'private' ? (
                    <>
                      <Shield className="size-3 text-secondary" aria-hidden="true" />
                      Private
                    </>
                  ) : (
                    <>
                      <Users className="size-3 text-secondary" aria-hidden="true" />
                      Workspace
                    </>
                  )}
                </span>
                {group.description && (
                  <span className="min-w-0 truncate" title={group.description}>
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
          {!group.deleted_at && (
            <DisabledActionTooltip disabled={!canManage} reason={PERMISSION_DENIED.group.invite}>
              <Button
                size="sm"
                variant="secondary"
                label="Invite"
                icon={<Users className="size-3" />}
                onClick={onInviteClick}
                isDisabled={!canManage}
              />
            </DisabledActionTooltip>
          )}
          {!group.deleted_at && (
            <DisabledActionTooltip disabled={!canCreatePlan} reason={PERMISSION_DENIED.plan.create}>
              <Button
                size="sm"
                label="New plan"
                icon={<Plus className="size-3" />}
                onClick={onCreatePlanClick}
                isDisabled={!canCreatePlan}
              />
            </DisabledActionTooltip>
          )}
          <DropdownMenu
            placement="below"
            button={{
              isIconOnly: true,
              icon: <MoreHorizontal className="size-4" />,
              variant: 'ghost',
              size: 'sm',
              label: 'More actions',
            }}
          >
            <SyncControlsMenu
              groupId={group.id}
              externalSource={group.external_source}
              syncStatus={rawSyncStatus}
              onLinkClick={() => setLinkOpen(true)}
              onResolveClick={() => setResolveOpen(true)}
              onRefreshClick={() => refresh.mutate()}
              isRefreshing={refresh.isPending}
            />
            <DropdownMenuItem
              label="Archive"
              isDisabled={!canDeleteGroup}
              onClick={() => onMenuAction('archive')}
            />
            <DropdownMenuItem
              label="Delete"
              style={{ color: 'var(--color-error)' }}
              isDisabled={!canDeleteGroup}
              onClick={() => onMenuAction('delete')}
            />
          </DropdownMenu>
        </div>
      </header>
      {isLinked && (
        <div
          data-testid="m365-auto-mirror-info"
          className="flex-none border-b border-border bg-card px-6 py-2 text-body-sm text-secondary"
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
