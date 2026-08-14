import { VStack } from '@seta/shared-ui';
import { resolveDashboardId } from '../nav/performance-dashboard.ts';
import { usePerformanceScopeContext } from '../state/performance-scope-context.tsx';
import { PerformanceAmDashboard } from './performance-am-dashboard.tsx';
import { PerformanceMemberDashboard } from './performance-member-dashboard.tsx';
import { PerformanceStrategicDashboard } from './performance-strategic-dashboard.tsx';
import { PerformanceTlDashboard } from './performance-tl-dashboard.tsx';

/**
 * SCR-02 Reviews home. The signed-in capacity picks the dashboard; each one reads the
 * roll-up API at its own scope (account / project / self / org), so the pillar axis,
 * the scores and the progress counters all come from the server.
 */
export function PerformanceHome() {
  const { resolved, role_slugs, can_view_org } = usePerformanceScopeContext();
  const capacity = resolved.capacity;

  if (capacity?.kind === 'am') {
    return (
      <PerformanceAmDashboard
        accountId={capacity.account_id}
        accountLabel={capacity.label}
        month={resolved.month}
      />
    );
  }

  if (capacity?.kind === 'tl') {
    return <PerformanceTlDashboard projectId={capacity.project_id} month={resolved.month} />;
  }

  if (capacity?.kind === 'member') {
    return <PerformanceMemberDashboard month={resolved.month} />;
  }

  // No delivery capacity → org tier. Only an org-viewer (people.performance.read_org)
  // gets the company view; everyone else lands on the empty mount — never a data leak.
  // HR's own cycle-config surface is a later ticket, so a people.manager who is also an
  // org-viewer gets the same org home rather than a blank page.
  const dashboard = resolveDashboardId(role_slugs, capacity, can_view_org);
  if (dashboard === 'strategic' || (dashboard === 'hr' && can_view_org)) {
    return <PerformanceStrategicDashboard month={resolved.month} />;
  }

  return <VStack data-testid="performance-home" />;
}
