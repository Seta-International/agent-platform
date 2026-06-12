import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { plannerKeys } from '../state/query-keys';

const EVENT_TYPES: readonly string[] = [
  'planner.group.created',
  'planner.group.updated',
  'planner.group.member.added',
  'planner.group.member.removed',
  'planner.group.member.role-changed',
  'planner.plan.created',
  'planner.plan.updated',
  'planner.plan.deleted',
  'planner.plan.archived',
  'planner.plan.unarchived',
  'planner.bucket.created',
  'planner.bucket.updated',
  'planner.bucket.deleted',
  'planner.bucket.moved',
  'planner.task.created',
  'planner.task.updated',
  'planner.task.deleted',
  'planner.task.restored',
  'planner.task.moved',
  'planner.task.assigned',
  'planner.task.unassigned',
  'planner.task.completed',
  'planner.task.reopened',
];

const DEBOUNCE_MS = 500;

export interface GroupActivityLive {
  /** Events received since the last applied refresh — drives the "N new" pill. */
  pendingCount: number;
  /** Force an immediate refetch and reset the pending counter. */
  flush: () => void;
}

/**
 * Subscribes to the planner board SSE for a single group and refetches the activity
 * feed's first page (and the rail query) on a debounce. The server formats labels, so
 * live items match paged items exactly.
 */
export function useGroupActivityLive(groupId: string): GroupActivityLive {
  const qc = useQueryClient();
  const [pendingCount, setPendingCount] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => {
    setPendingCount(0);
    void qc.invalidateQueries({ queryKey: plannerKeys.groupActivityFeed(groupId) });
    void qc.invalidateQueries({ queryKey: plannerKeys.groupActivity(groupId, 7) });
  }, [qc, groupId]);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!groupId) return;
    const url = `/api/planner/v1/board/stream?group_ids=${encodeURIComponent(groupId)}`;
    const es = new EventSource(url, { withCredentials: true });

    const onEvent = () => {
      setPendingCount((n) => n + 1);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(refresh, DEBOUNCE_MS);
    };
    const onGap = () => {
      void qc.invalidateQueries({ queryKey: plannerKeys.all });
      es.close();
    };

    for (const t of EVENT_TYPES) es.addEventListener(t, onEvent as EventListener);
    es.addEventListener('gap', onGap);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      for (const t of EVENT_TYPES) es.removeEventListener(t, onEvent as EventListener);
      es.removeEventListener('gap', onGap);
      es.close();
    };
  }, [groupId, qc, refresh]);

  return { pendingCount, flush };
}
