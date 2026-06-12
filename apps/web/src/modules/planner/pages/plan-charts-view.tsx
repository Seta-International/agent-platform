import type { ChartData } from '@seta/planner';
import {
  ChartCard,
  ChartLegend,
  DonutChart,
  StackedBarChart,
  type StackedBarRow,
} from '@seta/shared-ui';
import {
  STATUS_LEGEND,
  STATUS_SERIES,
  statusSlices,
  statusTotal,
} from '../components/charts/chart-status';
import { usePlanChart } from '../hooks/queries/use-plan-chart';

const PRIORITY_ORDER = ['urgent', 'important', 'medium', 'low'] as const;
const PRIORITY_LABEL: Record<(typeof PRIORITY_ORDER)[number], string> = {
  urgent: 'Urgent',
  important: 'Important',
  medium: 'Medium',
  low: 'Low',
};

function bucketRows(data: ChartData): StackedBarRow[] {
  return data.byBucket.map((b) => ({
    label: b.name,
    not_started: b.not_started,
    in_progress: b.in_progress,
    completed: b.completed,
    late: b.late,
    deferred: b.deferred,
  }));
}

function priorityRows(data: ChartData): StackedBarRow[] {
  return PRIORITY_ORDER.map((p) => ({ label: PRIORITY_LABEL[p], ...data.byPriority[p] }));
}

function memberRows(data: ChartData): StackedBarRow[] {
  return data.byMember.map((m) => ({
    label: m.displayName,
    not_started: m.not_started,
    in_progress: m.in_progress,
    completed: m.completed,
    late: m.late,
    deferred: m.deferred,
  }));
}

interface KpiStatProps {
  label: string;
  value: number;
  accent?: string;
}

function KpiStat({ label, value, accent }: KpiStatProps) {
  return (
    <div className="rounded-lg border border-hairline bg-canvas px-4 py-3">
      <div
        className="text-2xl font-semibold tabular-nums text-ink"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </div>
      <div className="mt-0.5 text-xs font-medium uppercase tracking-wide text-ink-subtle">
        {label}
      </div>
    </div>
  );
}

export function PlanChartsView({ planId }: { planId: string }) {
  const q = usePlanChart(planId);

  if (q.isPending) {
    return (
      <div
        data-testid="plan-charts-loading"
        className="flex h-full items-center justify-center text-sm text-ink-subtle"
      >
        Loading charts…
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-ink-subtle">
        <p>Couldn't load charts.</p>
        <button
          type="button"
          onClick={() => q.refetch()}
          className="rounded-md border border-hairline bg-canvas px-3 py-1.5 text-ink hover:bg-surface-2"
        >
          Retry
        </button>
      </div>
    );
  }

  const data = q.data;

  return (
    <div
      data-testid="plan-charts"
      className="flex h-full flex-col gap-5 overflow-auto bg-surface-1 p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ChartLegend items={STATUS_LEGEND} />
        <button
          type="button"
          onClick={() => q.refetch()}
          disabled={q.isFetching}
          className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-canvas px-3 py-1.5 text-sm text-ink hover:bg-surface-2 disabled:opacity-60"
        >
          {q.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div data-testid="plan-charts-summary" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiStat label="Open" value={data.kpis.open} />
        <KpiStat label="Completed" value={data.kpis.completed} accent="var(--color-success)" />
        <KpiStat label="Late" value={data.byStatus.late} accent="var(--color-danger)" />
        <KpiStat label="At risk" value={data.kpis.atRisk} accent="var(--color-warning)" />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <ChartCard title="Status" testId="chart-status">
          <DonutChart
            slices={statusSlices(data.byStatus)}
            centerValue={statusTotal(data.byStatus)}
            centerLabel="tasks"
          />
        </ChartCard>
        <ChartCard title="Priority" testId="chart-priority">
          <StackedBarChart rows={priorityRows(data)} series={STATUS_SERIES} />
        </ChartCard>
        <ChartCard title="Bucket" testId="chart-bucket">
          <StackedBarChart rows={bucketRows(data)} series={STATUS_SERIES} />
        </ChartCard>
        <ChartCard title="Members" testId="chart-member" className="xl:col-span-2">
          <StackedBarChart rows={memberRows(data)} series={STATUS_SERIES} labelWidth={140} />
        </ChartCard>
      </div>
    </div>
  );
}
