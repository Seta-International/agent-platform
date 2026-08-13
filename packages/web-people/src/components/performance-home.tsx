import { Spinner, Text, VStack } from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { performanceConfigOptions } from '../api/performance-query.ts';
import type { PerformanceGroupAxis } from '../mock/performance-scores.ts';
import { resolveDashboardId } from '../nav/performance-dashboard.ts';
import { usePerformanceScopeContext } from '../state/performance-scope-context.tsx';
import { PerformanceAmDashboard } from './performance-am-dashboard.tsx';
import { PerformanceMemberDashboard } from './performance-member-dashboard.tsx';
import { PerformanceStrategicDashboard } from './performance-strategic-dashboard.tsx';
import { PerformanceTlDashboard } from './performance-tl-dashboard.tsx';

/**
 * SCR-02 Reviews home. AM → account dashboard (pillar-by-project heatmap +
 * per-project member drill); member → self dashboard (my score, self-assessment,
 * score by project, lead review). Other capacities land in later tickets and
 * keep the empty mount point so the shell tabs and routing stay wired.
 */
export function PerformanceHome() {
  const { resolved, role_slugs } = usePerformanceScopeContext();
  const capacity = resolved.capacity;

  if (capacity?.kind === 'am') {
    return (
      <ConfiguredDashboard accountId={capacity.account_id}>
        {(groups) => (
          <PerformanceAmDashboard
            groups={groups}
            accountLabel={capacity.label}
            month={resolved.month}
          />
        )}
      </ConfiguredDashboard>
    );
  }

  if (capacity?.kind === 'tl') {
    return (
      <ConfiguredDashboard accountId={capacity.account_id}>
        {(groups) => (
          <PerformanceTlDashboard
            groups={groups}
            projectName={capacity.label}
            month={resolved.month}
          />
        )}
      </ConfiguredDashboard>
    );
  }

  if (capacity?.kind === 'member') {
    return (
      <ConfiguredDashboard accountId={capacity.account_id}>
        {(groups) => (
          <PerformanceMemberDashboard
            groups={groups}
            memberLabel={capacity.label}
            month={resolved.month}
          />
        )}
      </ConfiguredDashboard>
    );
  }

  // No delivery capacity → org tier. PMO / BoD / admin get the company view;
  // HR's cycle-config surface lands in a later ticket (keeps the empty mount).
  if (resolveDashboardId(role_slugs, capacity) === 'strategic') {
    return <PerformanceStrategicDashboard month={resolved.month} />;
  }

  return <VStack data-testid="performance-home" />;
}

/**
 * Loads the account's real evaluation groups (the config API) and hands them to
 * the capacity dashboard. The pillar axis is real; only the scores are mock
 * until the scoring API lands.
 */
function ConfiguredDashboard({
  accountId,
  children,
}: {
  accountId: string;
  children: (groups: PerformanceGroupAxis[]) => ReactElement;
}) {
  const q = useQuery(performanceConfigOptions(accountId));

  if (q.isPending) {
    return (
      <VStack data-testid="performance-home" vAlign="center" gap={2} className="py-12">
        <Spinner />
      </VStack>
    );
  }

  if (q.isError || !q.data) {
    return (
      <VStack data-testid="performance-home" gap={1}>
        <Text color="secondary">Couldn't load the account's evaluation groups.</Text>
      </VStack>
    );
  }

  const groups: PerformanceGroupAxis[] = q.data.groups.map((g) => ({
    group_id: g.group_id,
    name: g.name,
    weight: g.weight,
  }));
  return children(groups);
}
