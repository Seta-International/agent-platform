import type { ChartData } from '@seta/planner';

function pct(n: number, total: number) {
  return total ? `${Math.round((n / total) * 100)}%` : '0%';
}

function Card({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-hairline bg-canvas px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span
          className="text-2xl font-semibold tabular-nums text-ink"
          style={accent ? { color: accent } : undefined}
        >
          {value}
        </span>
        {sub && <span className="text-xs text-ink-subtle">{sub}</span>}
      </div>
    </div>
  );
}

export function KpiStrip({ kpis }: { kpis: ChartData['kpis'] }) {
  return (
    <div
      data-testid="plan-charts-summary"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5"
    >
      <Card label="Total" value={kpis.total} />
      <Card label="Completed" value={kpis.completed} sub={pct(kpis.completed, kpis.total)} />
      <Card label="In progress" value={kpis.in_progress} sub={pct(kpis.in_progress, kpis.total)} />
      <Card label="Open" value={kpis.open} />
      <Card label="Late" value={kpis.late} sub="overdue" accent="var(--color-danger)" />
    </div>
  );
}
