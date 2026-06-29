import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { GroupSyncStatusResponse } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

export function useGroupSyncStream(groupId: string | null | undefined): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!groupId) return;
    const url = `/api/integrations/m365/groups/${encodeURIComponent(groupId)}/sync-status/stream`;
    const es = new EventSource(url, { withCredentials: true });

    const handleSyncStatus = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as GroupSyncStatusResponse;
        qc.setQueryData<GroupSyncStatusResponse>(plannerKeys.groupSyncStatus(groupId), data);
      } catch {
        // malformed frame
      }
    };

    es.onerror = () => {
      // Connection error or closed — browser will auto-reconnect
    };

    es.addEventListener('sync-status', handleSyncStatus as EventListener);
    return () => {
      es.removeEventListener('sync-status', handleSyncStatus as EventListener);
      es.onerror = null;
      es.close();
    };
  }, [groupId, qc]);
}
