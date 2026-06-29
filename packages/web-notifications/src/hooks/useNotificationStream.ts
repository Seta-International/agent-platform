import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { notificationKeys } from '../state/query-keys.ts';

export function useNotificationStream(enabled: boolean, onInvalidate?: () => void): void {
  const qc = useQueryClient();
  const onInvalidateRef = useRef(onInvalidate);
  onInvalidateRef.current = onInvalidate;

  useEffect(() => {
    if (!enabled) return;
    const es = new EventSource('/api/notifications/v1/stream', { withCredentials: true });
    const handleInvalidate = () => {
      qc.invalidateQueries({ queryKey: notificationKeys.all });
      onInvalidateRef.current?.();
    };
    es.addEventListener('invalidate', handleInvalidate as EventListener);
    return () => {
      es.removeEventListener('invalidate', handleInvalidate as EventListener);
      es.close();
    };
  }, [enabled, qc]);
}
