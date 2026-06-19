import { Badge, PageChrome } from '@seta/shared-ui';
import { createFileRoute } from '@tanstack/react-router';
import { AlertTriangle, CheckCircle2, Clock, TrendingDown, TrendingUp } from 'lucide-react';
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
import type { Employee } from '@/modules/aria/mock-data.ts';
import { ACCOUNTS, EMPLOYEES, SCORE_THRESHOLDS, SELF_ID } from '@/modules/aria/mock-data.ts';
import { TimeRangeFilter, useTimeRange } from '@/modules/aria/TimeRangeFilter.tsx';

export const Route = createFileRoute('/_authed/aria/overview')({
  component: OverviewPage,
});

const SELF = EMPLOYEES.find((e) => e.id === SELF_ID) as Employee;
const ACTIVE = EMPLOYEES.filter((e) => e.status === 'Active');
const DEPT_PEERS = ACTIVE.filter((e) => e.dept === SELF.dept);
const DEPT_AVG = DEPT_PEERS.reduce((s, e) => s + e.avg_score, 0) / DEPT_PEERS.length;
const DEPT_RANK = DEPT_PEERS.filter((e) => e.avg_score > SELF.avg_score).length + 1;
const DEPT_PERCENTILE = Math.round((1 - DEPT_RANK / DEPT_PEERS.length) * 100);

const TREND_DATA = [
  { period: 'T3', score: SELF.score_t3, avg: parseFloat(DEPT_AVG.toFixed(2)) },
  { period: 'T4', score: SELF.score_t4, avg: parseFloat(DEPT_AVG.toFixed(2)) },
];

const MOM_DELTA = SELF.score_t4 - SELF.score_t3;
const MOM_POSITIVE = MOM_DELTA >= 0;

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

function OverviewPage() {
  const [timeRange, setTimeRange] = useTimeRange('month');
  return (
    <PageChrome breadcrumb={['ARIA']} title="My Performance Overview">
      <div className="page-container py-6 space-y-6">
        <TimeRangeFilter value={timeRange} onChange={setTimeRange} />
        {/* Identity strip */}
        <div className="rounded-xl border border-hairline bg-surface-1 overflow-hidden">
          <div className="flex items-center gap-4 px-5 py-4 bg-surface-2 border-b border-hairline">
            <div className="size-10 rounded-full bg-primary-tint flex items-center justify-center shrink-0">
              <span className="text-primary font-semibold text-body-sm">
                {SELF.id.replace('EMP-', '')}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-card-title font-semibold text-ink">{SELF.role}</h2>
                {riskBadge(SELF.risk_flag)}
              </div>
              <p className="text-body-sm text-ink-muted mt-0.5">
                {SELF.dept} · {ACCOUNTS[SELF.account]} · {SELF.level}
              </p>
            </div>
            <span className="text-caption text-ink-subtle font-mono shrink-0">{SELF.id}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-hairline">
            <div className="px-4 py-3 text-center">
              <p className="text-caption text-ink-subtle">Tier</p>
              <p className="text-body-sm font-medium text-ink mt-0.5">{SELF.tier}</p>
            </div>
            <div className="px-4 py-3 text-center">
              <p className="text-caption text-ink-subtle">Classification</p>
              <p className="text-body-sm font-medium text-ink mt-0.5">{SELF.classification}</p>
            </div>
            <div className="px-4 py-3 text-center">
              <p className="text-caption text-ink-subtle">Allocation</p>
              <p className="text-body-sm font-medium text-ink mt-0.5">{SELF.allocation_status}</p>
            </div>
            <div className="px-4 py-3 text-center">
              <p className="text-caption text-ink-subtle">Compliance</p>
              <div className="flex justify-center mt-0.5">
                {complianceBadge(SELF.ts_compliance)}
              </div>
            </div>
          </div>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <StatTile
            label="Latest Score"
            value={SELF.avg_score.toFixed(2)}
            sub="out of 5.00"
            colorClass={scoreColor(SELF.avg_score)}
          />
          <StatTile
            label="Month-over-Month"
            value={`${MOM_POSITIVE ? '+' : ''}${MOM_DELTA.toFixed(2)}`}
            sub="T3 → T4"
            colorClass={MOM_POSITIVE ? 'text-semantic-success' : 'text-danger-ink'}
          />
          <StatTile
            label="Dept Percentile"
            value={`${DEPT_PERCENTILE}${ordinal(DEPT_PERCENTILE)}`}
            sub={`Rank ${DEPT_RANK} of ${DEPT_PEERS.length} in ${SELF.dept.split(' - ')[1] ?? SELF.dept}`}
          />
          <StatTile
            label="Overtime (T4)"
            value={`${SELF.ot_t4}h`}
            sub="recorded hours"
            colorClass={SELF.ot_t4 > 20 ? 'text-semantic-warning' : 'text-ink'}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Score trend */}
          <div className="rounded-xl border border-hairline bg-surface-1 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-hairline bg-surface-2">
              {MOM_POSITIVE ? (
                <TrendingUp className="size-4 text-semantic-success" />
              ) : (
                <TrendingDown className="size-4 text-danger-ink" />
              )}
              <h3 className="text-body-sm font-semibold text-ink">Score trend</h3>
              <span className="ml-auto text-caption text-ink-subtle">T3 vs T4</span>
            </div>
            <div className="px-4 py-4">
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={TREND_DATA} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-hairline)" />
                  <XAxis
                    dataKey="period"
                    tick={{ fill: 'var(--color-ink-subtle)', fontSize: 11 }}
                  />
                  <YAxis domain={[0, 5]} tick={{ fill: 'var(--color-ink-subtle)', fontSize: 11 }} />
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
              {SELF.risk_flag === 'None' ? (
                <CheckCircle2 className="size-4 text-semantic-success" />
              ) : (
                <AlertTriangle className="size-4 text-semantic-warning" />
              )}
              <h3 className="text-body-sm font-semibold text-ink">Risk & compliance signals</h3>
            </div>
            <div className="px-4 py-4 space-y-3">
              <div className="flex items-center justify-between py-1.5 border-b border-hairline">
                <span className="text-body-sm text-ink-muted">Risk flag</span>
                {riskBadge(SELF.risk_flag)}
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-hairline">
                <span className="text-body-sm text-ink-muted">Open violations</span>
                <span
                  className={`text-body-sm font-medium ${SELF.open_violations > 0 ? 'text-danger-ink' : 'text-semantic-success'}`}
                >
                  {SELF.open_violations > 0 ? `${SELF.open_violations} open` : 'None'}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-hairline">
                <span className="text-body-sm text-ink-muted">Timesheet compliance</span>
                {complianceBadge(SELF.ts_compliance)}
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-hairline">
                <span className="text-body-sm text-ink-muted">Readiness score</span>
                <span className="text-body-sm font-medium text-ink">
                  {(SELF.readiness * 100).toFixed(0)}%
                </span>
              </div>
              {SELF.risk_note !== 'No flags' && (
                <div className="rounded-lg bg-semantic-warning-tint border border-semantic-warning/20 px-3 py-2.5 flex items-start gap-2">
                  <AlertTriangle className="size-3.5 text-semantic-warning mt-0.5 shrink-0" />
                  <p className="text-caption text-semantic-warning">{SELF.risk_note}</p>
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
              <p className="text-body-sm text-ink leading-relaxed">{SELF.feedback}</p>
            </div>
            <div>
              <p className="text-caption text-ink-subtle uppercase tracking-[0.06em] mb-2">
                Previous period
              </p>
              <p className="text-body-sm text-ink-muted leading-relaxed">{SELF.feedback_prev}</p>
            </div>
          </div>
        </div>
      </div>
    </PageChrome>
  );
}
