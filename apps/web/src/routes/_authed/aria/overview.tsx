import { Badge, PageChrome } from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Lock,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ForbiddenError, fetchMeDashboard, fetchPeriods } from '@/modules/aria/api/client.ts';
import { formatPeriod, PeriodFilter } from '@/modules/aria/PeriodFilter.tsx';

export const Route = createFileRoute('/_authed/aria/overview')({
  component: OverviewPage,
});

const SCORE_THRESHOLDS = { excellent: 4.5, good: 3.5, watch: 2.8 } as const;

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  switch (n % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

function scoreColor(score: number) {
  if (score >= SCORE_THRESHOLDS.excellent) return 'text-semantic-success';
  if (score >= SCORE_THRESHOLDS.good) return 'text-primary-ink';
  if (score >= SCORE_THRESHOLDS.watch) return 'text-semantic-warning';
  return 'text-danger-ink';
}

function riskBadge(flag: string) {
  if (flag === 'High') return <Badge variant="destructive">High risk</Badge>;
  if (flag === 'Watch') return <Badge variant="warning">Watch</Badge>;
  if (flag === 'Minor') return <Badge variant="warning">Minor</Badge>;
  return <Badge variant="success">No risk</Badge>;
}

function complianceBadge(compliance: string) {
  if (compliance === 'Compliant') return <Badge variant="success">Compliant</Badge>;
  if (compliance === 'Minor Late') return <Badge variant="warning">Minor Late</Badge>;
  return <Badge variant="destructive">{compliance}</Badge>;
}

function StatTile({
  label,
  value,
  sub,
  colorClass,
}: {
  label: string;
  value: string;
  sub?: string;
  colorClass?: string;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-surface-1 px-4 py-3.5 flex flex-col gap-1">
      <p className="text-caption text-ink-subtle uppercase tracking-[0.06em]">{label}</p>
      <p
        className={`text-[28px] font-semibold leading-none tracking-tight ${colorClass ?? 'text-ink'}`}
      >
        {value}
      </p>
      {sub && <p className="text-caption text-ink-subtle">{sub}</p>}
    </div>
  );
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-hairline bg-surface-2 px-3 py-2 shadow-lg text-body-sm">
      <p className="text-ink-subtle mb-1">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="size-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-ink-muted capitalize">{p.name}:</span>
          <span className="text-ink font-medium">{p.value.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

function StateBlock({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="page-container py-16 flex flex-col items-center gap-3 text-center">
      {icon}
      <p className="text-body-sm text-ink-muted">{children}</p>
    </div>
  );
}

function OverviewPage() {
  const [selected, setSelected] = useState<string | null>(null);

  const periodsQuery = useQuery({
    queryKey: ['performance', 'dashboard', 'periods'],
    queryFn: ({ signal }) => fetchPeriods(signal),
  });
  const periods = periodsQuery.data ?? [];
  const selectedPeriod = selected ?? periods[0] ?? null;

  const query = useQuery({
    queryKey: ['performance', 'dashboard', 'me', selectedPeriod],
    queryFn: ({ signal }) => fetchMeDashboard({ to_period: selectedPeriod ?? undefined }, signal),
    enabled: selectedPeriod !== null,
  });

  const loading = periodsQuery.isLoading || (selectedPeriod !== null && query.isLoading);
  const errored = periodsQuery.isError || (selectedPeriod !== null && query.isError);
  const error = periodsQuery.error ?? query.error;
  const noPeriods = !periodsQuery.isLoading && !periodsQuery.isError && periods.length === 0;
  const me = query.data ?? null;

  const momPositive = (me?.mom_delta ?? 0) >= 0;

  return (
    <PageChrome breadcrumb={['ARIA']} title="My Performance Overview">
      <div className="sticky top-0 z-20 border-b border-hairline bg-canvas">
        <div className="page-container py-3">
          <PeriodFilter
            periods={periods}
            value={selectedPeriod}
            onChange={setSelected}
            disabled={loading}
          />
        </div>
      </div>
      <div className="page-container py-6 space-y-6">
        {loading && (
          <StateBlock icon={<Loader2 className="size-6 text-ink-subtle animate-spin" />}>
            Loading your performance…
          </StateBlock>
        )}

        {!loading &&
          errored &&
          (error instanceof ForbiddenError ? (
            <StateBlock icon={<Lock className="size-8 text-ink-subtle" />}>
              You don't have access to performance dashboards.
            </StateBlock>
          ) : (
            <StateBlock icon={<AlertTriangle className="size-6 text-danger-ink" />}>
              Couldn't load your performance. Please try again.
            </StateBlock>
          ))}

        {!loading && !errored && noPeriods && (
          <StateBlock icon={<Clock className="size-6 text-ink-subtle" />}>
            No performance data available yet.
          </StateBlock>
        )}

        {!loading && !errored && me && (
          <>
            {/* Identity strip */}
            <div className="rounded-xl border border-hairline bg-surface-1 overflow-hidden">
              <div className="flex items-center gap-4 px-5 py-4 bg-surface-2 border-b border-hairline">
                <div className="size-10 rounded-full bg-primary-tint flex items-center justify-center shrink-0">
                  <span className="text-primary font-semibold text-body-sm">
                    {me.member_id.replace('EMP-', '')}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-card-title font-semibold text-ink">{me.role_title}</h2>
                    {riskBadge(me.risk_flag)}
                  </div>
                  <p className="text-body-sm text-ink-muted mt-0.5">
                    {me.department} · {me.account_name} · {me.level}
                  </p>
                </div>
                <span className="text-caption text-ink-subtle font-mono shrink-0">
                  {me.member_id}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-hairline">
                <div className="px-4 py-3 text-center">
                  <p className="text-caption text-ink-subtle">Tier</p>
                  <p className="text-body-sm font-medium text-ink mt-0.5">{me.performance_tier}</p>
                </div>
                <div className="px-4 py-3 text-center">
                  <p className="text-caption text-ink-subtle">Classification</p>
                  <p className="text-body-sm font-medium text-ink mt-0.5">
                    {me.classification_latest}
                  </p>
                </div>
                <div className="px-4 py-3 text-center">
                  <p className="text-caption text-ink-subtle">Allocation</p>
                  <p className="text-body-sm font-medium text-ink mt-0.5">{me.allocation_status}</p>
                </div>
                <div className="px-4 py-3 text-center">
                  <p className="text-caption text-ink-subtle">Compliance</p>
                  <div className="flex justify-center mt-0.5">
                    {complianceBadge(me.ts_compliance)}
                  </div>
                </div>
              </div>
            </div>

            {/* KPI tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <StatTile
                label="Latest Score"
                value={me.avg_score_latest.toFixed(2)}
                sub="out of 5.00"
                colorClass={scoreColor(me.avg_score_latest)}
              />
              <StatTile
                label="Month-over-Month"
                value={
                  me.mom_delta === null
                    ? '—'
                    : `${momPositive ? '+' : ''}${me.mom_delta.toFixed(2)}`
                }
                sub="vs previous period"
                colorClass={
                  me.mom_delta === null
                    ? 'text-ink'
                    : momPositive
                      ? 'text-semantic-success'
                      : 'text-danger-ink'
                }
              />
              <StatTile
                label="Dept Percentile"
                value={`${me.dept_percentile}${ordinal(me.dept_percentile)}`}
                sub={`Rank ${me.dept_rank} of ${me.dept_headcount} in ${me.department.split(' - ')[1] ?? me.department}`}
              />
              <StatTile
                label="Overtime"
                value={`${me.ot_hours_latest}h`}
                sub="recorded hours"
                colorClass={me.ot_hours_latest > 20 ? 'text-semantic-warning' : 'text-ink'}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Score trend */}
              <div className="rounded-xl border border-hairline bg-surface-1 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-hairline bg-surface-2">
                  {momPositive ? (
                    <TrendingUp className="size-4 text-semantic-success" />
                  ) : (
                    <TrendingDown className="size-4 text-danger-ink" />
                  )}
                  <h3 className="text-body-sm font-semibold text-ink">Score trend</h3>
                  <span className="ml-auto text-caption text-ink-subtle">vs dept avg</span>
                </div>
                <div className="px-4 py-4">
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart
                      data={me.trend.map((t) => ({
                        period: formatPeriod(t.period),
                        score: t.score,
                        avg: t.dept_avg,
                      }))}
                      margin={{ top: 8, right: 12, bottom: 0, left: -20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-hairline)" />
                      <XAxis
                        dataKey="period"
                        tick={{ fill: 'var(--color-ink-subtle)', fontSize: 11 }}
                      />
                      <YAxis
                        domain={[0, 5]}
                        tick={{ fill: 'var(--color-ink-subtle)', fontSize: 11 }}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <ReferenceLine
                        y={SCORE_THRESHOLDS.good}
                        stroke="var(--color-semantic-success)"
                        strokeDasharray="4 4"
                        strokeOpacity={0.5}
                      />
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke="var(--color-primary)"
                        strokeWidth={2.5}
                        dot={{ fill: 'var(--color-primary)', r: 4 }}
                        name="My score"
                      />
                      <Line
                        type="monotone"
                        dataKey="avg"
                        stroke="var(--color-ink-subtle)"
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                        dot={false}
                        name="Dept avg"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="flex items-center gap-4 mt-2 justify-center">
                    <span className="flex items-center gap-1.5 text-caption text-ink-muted">
                      <span className="inline-block w-4 h-0.5 bg-primary rounded" />
                      My score
                    </span>
                    <span className="flex items-center gap-1.5 text-caption text-ink-muted">
                      <span className="inline-block w-4 h-px bg-ink-subtle rounded border-dashed border-t border-ink-subtle" />
                      Dept avg
                    </span>
                  </div>
                </div>
              </div>

              {/* Compliance & risk */}
              <div className="rounded-xl border border-hairline bg-surface-1 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-hairline bg-surface-2">
                  {me.risk_flag === 'None' ? (
                    <CheckCircle2 className="size-4 text-semantic-success" />
                  ) : (
                    <AlertTriangle className="size-4 text-semantic-warning" />
                  )}
                  <h3 className="text-body-sm font-semibold text-ink">Risk & compliance signals</h3>
                </div>
                <div className="px-4 py-4 space-y-3">
                  <div className="flex items-center justify-between py-1.5 border-b border-hairline">
                    <span className="text-body-sm text-ink-muted">Risk flag</span>
                    {riskBadge(me.risk_flag)}
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b border-hairline">
                    <span className="text-body-sm text-ink-muted">Open violations</span>
                    <span
                      className={`text-body-sm font-medium ${me.open_violations > 0 ? 'text-danger-ink' : 'text-semantic-success'}`}
                    >
                      {me.open_violations > 0 ? `${me.open_violations} open` : 'None'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b border-hairline">
                    <span className="text-body-sm text-ink-muted">Timesheet compliance</span>
                    {complianceBadge(me.ts_compliance)}
                  </div>
                  {me.perf_risk_note && me.perf_risk_note !== 'No flags' && (
                    <div className="rounded-lg bg-semantic-warning-tint border border-semantic-warning/20 px-3 py-2.5 flex items-start gap-2">
                      <AlertTriangle className="size-3.5 text-semantic-warning mt-0.5 shrink-0" />
                      <p className="text-caption text-semantic-warning">{me.perf_risk_note}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Feedback */}
            <div className="rounded-xl border border-hairline bg-surface-1 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-hairline bg-surface-2">
                <Clock className="size-4 text-ink-subtle" />
                <h3 className="text-body-sm font-semibold text-ink">Manager feedback</h3>
              </div>
              <div className="px-4 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-caption text-ink-subtle uppercase tracking-[0.06em] mb-2">
                    Current period
                  </p>
                  <p className="text-body-sm text-ink leading-relaxed">
                    {me.feedback_current ??
                      me.feedback_category_current ??
                      'No written feedback recorded.'}
                  </p>
                </div>
                <div>
                  <p className="text-caption text-ink-subtle uppercase tracking-[0.06em] mb-2">
                    Previous period
                  </p>
                  <p className="text-body-sm text-ink-muted leading-relaxed">
                    {me.feedback_prev ?? 'No written feedback recorded.'}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </PageChrome>
  );
}
