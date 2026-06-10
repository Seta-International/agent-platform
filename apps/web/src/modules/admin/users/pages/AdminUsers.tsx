import { PageChrome } from '@seta/shared-ui';
import { useEffect, useState } from 'react';
import { listProviders } from '@/modules/admin/sso/api/sso-client.ts';
import { ImportFromEntraDialog } from '@/modules/admin/sso/components/ImportFromEntraDialog.tsx';
import { AdminUsersTable } from '../components/AdminUsersTable.tsx';
import { BulkRoleBar } from '../components/BulkRoleBar.tsx';
import { CreateUserDialog } from '../components/CreateUserDialog.tsx';

export function AdminUsers() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [hasActiveEntra, setHasActiveEntra] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const bump = () => setRefreshKey((k) => k + 1);

  const onToggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const onTogglePage = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

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
    <PageChrome
      breadcrumb={['Admin']}
      title="Users"
      actions={
        <>
          <ImportFromEntraDialog enabled={hasActiveEntra} onImported={bump} />
          <CreateUserDialog onCreated={bump} triggerLabel="Invite user" />
        </>
      }
    >
      <div className="page-container space-y-4">
        <AdminUsersTable
          refreshKey={refreshKey}
          selected={selected}
          onToggle={onToggle}
          onTogglePage={onTogglePage}
        />
        {selected.size > 0 && (
          <BulkRoleBar
            selected={selected}
            onClear={() => setSelected(new Set())}
            onDone={() => {
              setSelected(new Set());
              bump();
            }}
          />
        )}
      </div>
    </PageChrome>
  );
}
