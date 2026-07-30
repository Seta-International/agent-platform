import { useQuery } from '@tanstack/react-query';
import { cycleStatusOptions } from '../api/performance-query.ts';
import { CycleStatusBadge } from './cycle-status-badge.tsx';

/**
 * Loads server cycleStatus for `month` and echoes it (FE-AD-12).
 * Never classifies from the client clock.
 */
export function CycleStatusBadgeLoader({ month }: { month: string }) {
  const query = useQuery(cycleStatusOptions(month));

  if (query.isPending) {
    return (
      <span data-testid="cycle-status-badge" className="text-sm text-secondary">
        Loading cycle…
      </span>
    );
  }
  if (query.isError || !query.data) {
    return (
      <span data-testid="cycle-status-badge" className="text-sm text-secondary" role="status">
        Cycle status unavailable
      </span>
    );
  }
  return <CycleStatusBadge status={query.data.status} />;
}
