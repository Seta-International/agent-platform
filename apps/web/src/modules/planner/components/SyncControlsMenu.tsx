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
}

export function SyncControlsMenu({
  groupId,
  externalSource,
  syncStatus,
  canManage,
  onLinkClick,
  onResolveClick,
}: Props) {
  const refresh = useRefreshGroupSync(groupId);
  const unlink = useUnlinkGroupFromM365(groupId);

  const isNative = externalSource === 'native';

  if (isNative && !canManage) return null;

  return (
    <>
      {isNative && canManage && (
        <DropdownMenuItem onSelect={onLinkClick}>Link to M365…</DropdownMenuItem>
      )}
      {!isNative && canManage && (
        <DropdownMenuItem onSelect={() => refresh.mutate()}>Refresh sync</DropdownMenuItem>
      )}
      {!isNative && canManage && (
        <DropdownMenuItem onSelect={() => unlink.mutate()}>Unlink from M365</DropdownMenuItem>
      )}
      {!isNative && canManage && syncStatus === 'conflict' && (
        <DropdownMenuItem onSelect={onResolveClick}>Resolve conflict…</DropdownMenuItem>
      )}
    </>
  );
}
