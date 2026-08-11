import { Button, SettingsSection, VStack } from '@seta/shared-ui';
import { RefreshCw } from 'lucide-react';
import { AdminPageFrame } from '../../components/AdminPageFrame.tsx';
import { ConflictQueue } from '../components/ConflictQueue.tsx';
import { DirectoryRunStatus } from '../components/DirectoryRunStatus.tsx';
import {
  useDirectoryConflicts,
  useDirectorySync,
  useOrgUnits,
} from '../hooks/use-directory-sync.ts';

/**
 * The M365 directory-sync admin screen (design §9.3): a run-status region and the open conflict
 * queue. Resolved and ignored rows are never fetched — the queue is what still needs a human.
 */
export function M365DirectorySync() {
  const sync = useDirectorySync();
  const conflicts = useDirectoryConflicts('open');

  const rows = conflicts.data ?? [];
  // `reassign` needs somewhere to move people to; a `user_removed` subject arrives as a bare id.
  // Nothing else on this screen reads the org chart, so nothing else pays for it.
  const needsOrgChart = rows.some(
    (row) => row.kind === 'unit_delete_blocked' || row.kind === 'user_removed',
  );
  const org = useOrgUnits(needsOrgChart);

  const openCount = sync.status?.open_conflicts ?? rows.length;
  const subtitle = sync.isRunInFlight
    ? 'Syncing…'
    : openCount === 0
      ? 'Up to date'
      : `${openCount} conflict${openCount === 1 ? '' : 's'} to review`;

  return (
    <AdminPageFrame
      crumb="Directory sync"
      title="Directory sync"
      subtitle={subtitle}
      isFullWidth
      actions={
        <Button
          variant="primary"
          label={sync.isRunInFlight ? 'Syncing…' : 'Sync now'}
          icon={<RefreshCw className="size-4" aria-hidden />}
          // Disabled while a run is in flight: a second full census would collapse onto the same
          // per-tenant job key anyway, so the button would lie about having done anything.
          isDisabled={sync.isRunInFlight || sync.status?.configured === false}
          onClick={() => void sync.startSync()}
        />
      }
    >
      <SettingsSection
        title="Last run"
        description="Microsoft 365 is the source of truth for people, departments and reporting lines. This sync is one-way — nothing here is written back to Entra."
      >
        <VStack paddingBlock={4}>
          <DirectoryRunStatus
            status={sync.status}
            isLoading={sync.isLoading}
            isRunInFlight={sync.isRunInFlight}
            error={sync.error}
            startError={sync.startError}
          />
        </VStack>
      </SettingsSection>

      <ConflictQueue
        conflicts={conflicts.data}
        isLoading={conflicts.isLoading}
        error={(conflicts.error as Error | null) ?? null}
        isRunInFlight={sync.isRunInFlight}
        nameFor={org.nameFor}
        orgUnits={org.units}
        orgUnitsError={org.error}
      />
    </AdminPageFrame>
  );
}
