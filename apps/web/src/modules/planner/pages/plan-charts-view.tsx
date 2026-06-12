import type { ChartData } from '@seta/planner';
import { STATUS_LABEL } from '../components/charts/chart-status';
import {
  type StackedRow,
  StackedStatusBarChart,
} from '../components/charts/stacked-status-bar-chart';
import { StatusDonutChart } from '../components/charts/status-donut-chart';
import { usePlanChart } from '../hooks/queries/use-plan-chart';

const PRIORITY_ORDER = ['urgent', 'important', 'medium', 'low'] as const;
const PRIORITY_LABEL: Record<(typeof PRIORITY_ORDER)[number], string> = {
  urgent: 'Urgent',
  important: 'Important',
  medium: 'Medium',
  low: 'Low',
};

function bucketRows(data: ChartData): StackedRow[] {
  return data.byBucket.map((b) => ({
    label: b.name,
    not_started: b.not_started,
    in_progress: b.in_progress,
    completed: b.completed,
    late: b.late,
    deferred: b.deferred,
  }));
}

function priorityRows(data: ChartData): StackedRow[] {
  return PRIORITY_ORDER.map((p) => ({ label: PRIORITY_LABEL[p], ...data.byPriority[p] }));
}

function memberRows(data: ChartData): StackedRow[] {
  return data.byMember.map((m) => ({
    label: m.displayName,
    not_started: m.not_started,
    in_progress: m.in_progress,
    completed: m.completed,
    late: m.late,
    deferred: m.deferred,
  }));
}

export function PlanChartsView({ planId }: { planId: string }) {
  const q = usePlanChart(planId);

  if (q.isPending) {
    return (
      <div className="plan-charts" data-testid="plan-charts-loading">
        Loading charts…
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="plan-charts">
        <p>Couldn't load charts.</p>
        <button type="button" onClick={() => q.refetch()}>
          Retry
        </button>
      </div>
    );
  }

  const data = q.data;

  return (
    <div className="plan-charts" data-testid="plan-charts">
      <div className="plan-charts__toolbar">
        <button type="button" onClick={() => q.refetch()} disabled={q.isFetching}>
          {q.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <aside className="plan-charts__summary" data-testid="plan-charts-summary">
        <div>Open: {data.kpis.open}</div>
        <div>Completed: {data.kpis.completed}</div>
        <div>At risk: {data.kpis.atRisk}</div>
        <div>
          {STATUS_LABEL.late}: {data.byStatus.late}
        </div>
      </aside>

      <section className="plan-charts__grid">
        <article data-testid="chart-status">
          <h3>Status</h3>
          <StatusDonutChart data={data.byStatus} />
        </article>
        <article data-testid="chart-bucket">
          <h3>Bucket</h3>
          <StackedStatusBarChart rows={bucketRows(data)} />
        </article>
        <article data-testid="chart-priority">
          <h3>Priority</h3>
          <StackedStatusBarChart rows={priorityRows(data)} />
        </article>
        <article data-testid="chart-member">
          <h3>Members</h3>
          <StackedStatusBarChart rows={memberRows(data)} />
        </article>
      </section>
    </div>
  );
}
