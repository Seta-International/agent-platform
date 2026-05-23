import { useEffect, useState } from 'react';
import { listProviders } from '@/modules/console/sso/api/sso-client.ts';
import { ImportFromEntraDialog } from '@/modules/console/sso/components/ImportFromEntraDialog.tsx';
import { AdminUsersTable } from '../components/AdminUsersTable.tsx';
import { CreateUserDialog } from '../components/CreateUserDialog.tsx';

export function AdminUsers() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [hasActiveEntra, setHasActiveEntra] = useState(false);
  const bump = () => setRefreshKey((k) => k + 1);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey is a manual trigger; incrementing it forces a re-fetch
  useEffect(() => {
    listProviders()
      .then((rows) => {
        setHasActiveEntra(rows.some((r) => r.provider_id === 'microsoft-entra-id' && r.enabled));
      })
      .catch(() => {
        // non-fatal — leave hasActiveEntra false
      });
  }, [refreshKey]);

  return (
    <div className="space-y-4 px-7 py-6">
      <div>
        <div className="text-xs text-ink-muted">Admin</div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <div className="flex items-center gap-2">
            <ImportFromEntraDialog enabled={hasActiveEntra} onImported={bump} />
            <CreateUserDialog onCreated={bump} triggerLabel="Invite user" />
          </div>
        </div>
      </div>
      <AdminUsersTable refreshKey={refreshKey} />
    </div>
  );
}
