import { Text } from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import type {
  MonthTaskCard,
  MonthTasksResponse,
  PerformanceCapacity,
} from '../api/people-client.ts';
import { monthTasksOptions } from '../api/performance-query.ts';
import {
  dashboardCopy,
  formatPerformanceMonth,
  resolveDashboardId,
} from '../nav/performance-dashboard.ts';
import { usePerformanceScopeContext } from '../state/performance-scope-context.tsx';
import { TasksForThisMonth } from './tasks-for-this-month.tsx';

function kpiFromTasks(
  dashboardId: ReturnType<typeof resolveDashboardId>,
  data: MonthTasksResponse | undefined,
  activeCapacity: PerformanceCapacity | null,
): { label: string; value: string; hint: string }[] {
  const monthLabel = formatPerformanceMonth(data?.month ?? '');
  const cycle = data?.cycle_status ?? '—';
  const activeGroup =
    data?.groups.find((g) => capacityEquals(g.capacity, activeCapacity)) ?? data?.groups[0];

  const unscored = activeGroup?.cards.find(
    (c): c is Extract<MonthTaskCard, { kind: 'unscored' }> => c.kind === 'unscored',
  );
  const self = activeGroup?.cards.find((c) => c.kind === 'self_assessment');
  const morale = activeGroup?.cards.find((c) => c.kind === 'morale');
  const locked = activeGroup?.cards.some((c) => c.kind === 'cycle_locked');

  if (dashboardId === 'member') {
    return [
      {
        label: 'Self-assessment',
        value: locked
          ? 'Locked'
          : self && self.kind === 'self_assessment' && self.submitted
            ? 'Submitted'
            : 'Not started',
        hint: locked ? 'cycle closed' : 'do it first',
      },
      {
        label: 'Morale pulse',
        value: locked
          ? 'Locked'
          : morale && morale.kind === 'morale' && morale.submitted
            ? 'Submitted'
            : 'Not started',
        hint: 'this month',
      },
      { label: 'Cycle', value: monthLabel || '—', hint: cycle },
    ];
  }

  if (dashboardId === 'tl' || dashboardId === 'am') {
    const total = unscored?.total ?? 0;
    const left = unscored?.unscored ?? 0;
    const done = Math.max(0, total - left);
    return [
      {
        label: dashboardId === 'am' ? 'Team Leads to review' : 'My team',
        value: locked ? 'Locked' : String(left),
        hint: locked ? 'cycle closed' : `${done}/${total} evaluated`,
      },
      {
        label: 'Evaluated',
        value: locked ? '—' : `${done}/${total}`,
        hint: total === 0 ? 'no one in scope' : `${Math.round((done / total) * 100)}% done`,
      },
      { label: 'Cycle', value: monthLabel || '—', hint: cycle },
    ];
  }

  return [
    {
      label: 'Tasks',
      value: data?.groups.length ? String(data.groups.length) : '0',
      hint: 'capacity groups',
    },
    { label: 'Cycle', value: monthLabel || '—', hint: cycle },
  ];
}

function capacityEquals(a: PerformanceCapacity, b: PerformanceCapacity | null): boolean {
  if (!b || a.kind !== b.kind) return false;
  if (a.kind === 'am' && b.kind === 'am') return a.account_id === b.account_id;
  if (a.kind !== 'am' && b.kind !== 'am') return a.project_id === b.project_id;
  return false;
}

/**
 * SCR-02 home: role dashboard chrome + tasks-for-this-month (FUT-695).
 */
export function PerformanceHome() {
  const { role_slugs, resolved, search } = usePerformanceScopeContext();
  const dashboardId = resolveDashboardId(role_slugs, resolved.capacity);
  const copy = dashboardCopy(dashboardId);
  const month = resolved.month;
  const tasksQuery = useQuery(monthTasksOptions(month));

  return (
    <div
      className="flex flex-col gap-6"
      data-testid="performance-home"
      data-dashboard={dashboardId}
    >
      <header className="flex flex-col gap-1">
        <Text as="h2" size="lg" weight="semibold">
          {copy.title}
        </Text>
        <Text color="secondary" size="sm">
          {copy.subtitle}
        </Text>
        <Text size="sm" color="secondary" data-testid="performance-home-period">
          Period · {formatPerformanceMonth(month)}
        </Text>
      </header>

      {tasksQuery.isPending ? (
        <Text color="secondary" data-testid="performance-home-kpis-loading">
          Loading this month&apos;s summary…
        </Text>
      ) : tasksQuery.isError ? (
        <Text color="secondary" role="status" data-testid="performance-home-kpis-error">
          Couldn&apos;t load this month&apos;s summary.
        </Text>
      ) : (
        <>
          <div
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            data-testid="performance-home-kpis"
          >
            {kpiFromTasks(dashboardId, tasksQuery.data, resolved.capacity).map((kpi) => (
              <div
                key={kpi.label}
                className="rounded-md border border-hairline bg-surface px-4 py-3"
                data-testid={`performance-kpi-${kpi.label}`}
              >
                <Text size="sm" color="secondary">
                  {kpi.label}
                </Text>
                <Text as="p" size="lg" weight="semibold" className="mt-1">
                  {kpi.value}
                </Text>
                <Text size="sm" color="secondary">
                  {kpi.hint}
                </Text>
              </div>
            ))}
          </div>

          <TasksForThisMonth
            groups={tasksQuery.data.groups}
            search={search}
            cycleStatus={tasksQuery.data.cycle_status}
          />
        </>
      )}

      <Text size="sm" color="secondary" data-testid="performance-scores-placeholder">
        Scores &amp; rollups arrive with the scoring epic — this home focuses on what to do this
        month.
      </Text>
    </div>
  );
}
