import { DropdownMenuItem } from '@seta/shared-ui';
import { useRefreshGroupSync } from '../hooks/mutations/refresh-group-sync';
import { useUnlinkGroupFromM365 } from '../hooks/mutations/unlink-group-from-m365';

interface Props {
  groupId: string;
  externalSource: 'native' | 'm365' | string;
  syncStatus: string | null;
  canManage: boolean;
  onLinkClick: () => void;
  onResolveClick: () => void;
  onRefreshClick?: () => void;
  isRefreshing?: boolean;
}

export function SyncControlsMenu({
  groupId,
  externalSource,
  syncStatus,
  canManage,
  onLinkClick,
  onResolveClick,
  onRefreshClick,
  isRefreshing,
}: Props) {
  const internalRefresh = useRefreshGroupSync(groupId);
  const handleRefresh = onRefreshClick ?? (() => internalRefresh.mutate());
  const refreshPending = isRefreshing ?? internalRefresh.isPending;
  const unlink = useUnlinkGroupFromM365(groupId);

  const isNative = externalSource === 'native';

  if (isNative && !canManage) return null;

  return (
    <>
      {isNative && canManage && (
        <DropdownMenuItem onSelect={onLinkClick}>Link with Microsoft 365…</DropdownMenuItem>
      )}
      {!isNative && (
        <DropdownMenuItem onSelect={handleRefresh} disabled={refreshPending}>
          {refreshPending ? 'Syncing…' : 'Sync now'}
        </DropdownMenuItem>
      )}
      {!isNative && canManage && (
        <DropdownMenuItem onSelect={() => unlink.mutate()} disabled={unlink.isPending}>
          {unlink.isPending ? 'Unlinking…' : 'Unlink from Microsoft 365'}
        </DropdownMenuItem>
      )}
      {!isNative && canManage && syncStatus === 'conflict' && (
        <DropdownMenuItem onSelect={onResolveClick}>Review changes…</DropdownMenuItem>
      )}
    </>
  );
}
