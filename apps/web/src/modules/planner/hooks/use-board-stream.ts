import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { applyPlannerEvent, type StreamEvent } from '../state/apply-planner-event';
import { useConnectionStatus } from '../state/connection-status';
import { plannerKeys } from '../state/query-keys';

const EVENT_TYPES: readonly string[] = [
  'planner.group.created',
  'planner.group.updated',
  'planner.group.deleted',
  'planner.group.restored',
  'planner.group.member.added',
  'planner.group.member.removed',
  'planner.plan.created',
  'planner.plan.updated',
  'planner.plan.deleted',
  'planner.plan.restored',
  'planner.bucket.created',
  'planner.bucket.updated',
  'planner.bucket.deleted',
  'planner.task.created',
  'planner.task.updated',
  'planner.task.deleted',
  'planner.task.restored',
  'planner.task.moved',
  'planner.task.assigned',
  'planner.task.unassigned',
  'planner.task.completed',
  'planner.task.reopened',
  'planner.checklist_item.added',
  'planner.checklist_item.updated',
  'planner.checklist_item.removed',
  'planner.label.created',
  'planner.label.updated',
  'planner.label.deleted',
  'planner.label.applied',
  'planner.label.unapplied',
];

export function useBoardStream(accessibleGroupIds: string[]): void {
  const qc = useQueryClient();
  const setStatus = useConnectionStatus((s) => s.set);
  const joined = accessibleGroupIds.join(',');

  useEffect(() => {
    if (joined.length === 0) return;
    setStatus('connecting');

    const url = `/api/planner/v1/board/stream?group_ids=${encodeURIComponent(joined)}`;
    const es = new EventSource(url, { withCredentials: true });

    const handleOpen = () => setStatus('open');
    const handleError = () => setStatus('reconnecting');
    const handleGap = () => {
      qc.invalidateQueries({ queryKey: plannerKeys.all });
      es.close();
    };
    const handleMessage = (e: MessageEvent) => {
      try {
        const raw = JSON.parse(e.data) as StreamEvent;
        applyPlannerEvent(qc, raw);
      } catch {
        // Malformed frames are ignored; server is the only producer.
      }
    };

    es.addEventListener('open', handleOpen);
    es.addEventListener('error', handleError);
    es.addEventListener('gap', handleGap);
    for (const t of EVENT_TYPES) es.addEventListener(t, handleMessage as EventListener);

    return () => {
      es.close();
      setStatus('idle');
    };
  }, [joined, qc, setStatus]);
}
