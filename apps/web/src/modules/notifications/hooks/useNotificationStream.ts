import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { notificationKeys } from '../state/query-keys';

export function useNotificationStream(enabled: boolean): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const es = new EventSource('/api/notifications/v1/stream', { withCredentials: true });
    const onInvalidate = () => {
      qc.invalidateQueries({ queryKey: notificationKeys.all });
    };
    es.addEventListener('invalidate', onInvalidate as EventListener);
    return () => {
      es.removeEventListener('invalidate', onInvalidate as EventListener);
      es.close();
    };
  }, [enabled, qc]);
}
