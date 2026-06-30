import { DropdownMenuItem } from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useRefreshGroupSync } from '../hooks/mutations/refresh-group-sync';
import { useUnlinkGroupFromM365 } from '../hooks/mutations/unlink-group-from-m365';

interface Props {
  groupId: string;
  externalSource: 'native' | 'm365' | string;
  syncStatus: string | null;
  onLinkClick: () => void;
  onResolveClick: () => void;
  onRefreshClick?: () => void;
  isRefreshing?: boolean;
}

export function SyncControlsMenu({
  groupId,
  externalSource,
  syncStatus,
  onLinkClick,
  onResolveClick,
  onRefreshClick,
  isRefreshing,
}: Props) {
  const internalRefresh = useRefreshGroupSync(groupId);
  const handleRefresh = onRefreshClick ?? (() => internalRefresh.mutate());
  const refreshPending = isRefreshing ?? internalRefresh.isPending;
  const unlink = useUnlinkGroupFromM365(groupId);

  // Linking/unlinking a group to M365 mutates the group; gate on the group update permission.
  // Permission-gated items render disabled (not hidden) so the capability stays discoverable.
  const canManageLink = usePermission('planner.group.update');
  const isNative = externalSource === 'native';

  return (
    <>
      {isNative && (
        <DropdownMenuItem onSelect={onLinkClick} disabled={!canManageLink}>
          Link with Microsoft 365…
        </DropdownMenuItem>
      )}
      {!isNative && (
        <DropdownMenuItem onSelect={handleRefresh} disabled={refreshPending}>
          {refreshPending ? 'Syncing…' : 'Sync now'}
        </DropdownMenuItem>
      )}
      {!isNative && (
        <DropdownMenuItem
          onSelect={() => unlink.mutate()}
          disabled={!canManageLink || unlink.isPending}
        >
          {unlink.isPending ? 'Unlinking…' : 'Unlink from Microsoft 365'}
        </DropdownMenuItem>
      )}
      {!isNative && syncStatus === 'conflict' && (
        <DropdownMenuItem onSelect={onResolveClick} disabled={!canManageLink}>
          Review changes…
        </DropdownMenuItem>
      )}
    </>
  );
}
