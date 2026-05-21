import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { plannerKeys } from '../../state/query-keys';

export function useGroupSyncStream(groupId: string | null | undefined): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!groupId) return;
    const url = `/api/integrations/m365/groups/${encodeURIComponent(groupId)}/sync-status/stream`;
    const es = new EventSource(url, { withCredentials: true });

    const handleSyncStatus = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as {
          sync_status: string | null;
          synced_at?: string | null;
          last_error?: string | null;
        };
        qc.setQueryData(plannerKeys.groupSyncStatus(groupId), data);
      } catch {
        // malformed frame
      }
    };

    es.addEventListener('sync-status', handleSyncStatus as EventListener);
    return () => {
      es.removeEventListener('sync-status', handleSyncStatus as EventListener);
      es.close();
    };
  }, [groupId, qc]);
}
