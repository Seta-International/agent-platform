import { Badge, PageChrome } from '@seta/shared-ui';
import { createFileRoute } from '@tanstack/react-router';
import { Building2, Lock, TrendingUp } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ACCOUNTS, EMPLOYEES, SCORE_THRESHOLDS } from '@/modules/aria/mock-data.ts';
import { TimeRangeFilter, useTimeRange } from '@/modules/aria/TimeRangeFilter.tsx';
import { usePermission } from '@/modules/identity/components/Can.tsx';

export const Route = createFileRoute('/_authed/aria/executive')({
  component: ExecutivePage,
});

// Hardcoded hex — CSS vars don't resolve inside recharts SVG
const C = {
  primary: '#0047FF',
  primaryInk: '#93b1ff',
  danger: '#e5484d',
  warning: '#f4a73a',
  success: '#27a644',
  subtle: '#8a8f98',
  muted: '#d0d6e0',
  hairline: '#23252a',
  surface2: '#181a1d',
} as const;

const ACTIVE = EMPLOYEES.filter((e) => e.status === 'Active');
const TALENT_HEALTHY = ACTIVE.filter((e) => e.avg_score >= SCORE_THRESHOLDS.good);
const AT_RISK = ACTIVE.filter((e) => e.risk_flag === 'High' || e.risk_flag === 'Watch');
const PROMOTION_READY = ACTIVE.filter((e) => e.readiness >= 0.8);
const BILLABLE = ACTIVE.filter((e) => e.allocation_status === 'Active');
const AVG_SCORE = ACTIVE.reduce((s, e) => s + e.avg_score, 0) / ACTIVE.length;
const TALENT_HEALTH_PCT = Math.round((TALENT_HEALTHY.length / ACTIVE.length) * 100);
const UTILIZATION_PCT = Math.round((BILLABLE.length / ACTIVE.length) * 100);

const ACCOUNT_STATS = Object.entries(
  ACTIVE.reduce<Record<string, { count: number; scores: number[]; risk: number }>>((acc, e) => {
    const key = e.account;
    if (!acc[key]) acc[key] = { count: 0, scores: [], risk: 0 };
    acc[key].count += 1;
    acc[key].scores.push(e.avg_score);
    if (e.risk_flag === 'High' || e.risk_flag === 'Watch') acc[key].risk += 1;
    return acc;
  }, {}),
).map(([acct, d]) => ({
  account: ACCOUNTS[acct] ?? acct,
  acct,
  count: d.count,
  avgScore: parseFloat((d.scores.reduce((s, v) => s + v, 0) / d.scores.length).toFixed(2)),
  riskCount: d.risk,
  healthPct: Math.round(
    (d.scores.filter((s) => s >= SCORE_THRESHOLDS.good).length / d.scores.length) * 100,
  ),
}));

const TIER_DIST = [
  {
    tier: 'Exceeds',
    count: ACTIVE.filter((e) => e.tier === 'Exceeds Expectations').length,
    color: C.primary,
  },
  {
    tier: 'Meets',
    count: ACTIVE.filter((e) => e.tier === 'Meets Expectations').length,
    color: C.primaryInk,
  },
  {
    tier: 'Partially',
    count: ACTIVE.filter((e) => e.tier === 'Partially Meets').length,
    color: C.warning,
  },
  {
    tier: 'Does Not Meet',
    count: ACTIVE.filter((e) => e.tier === 'Does Not Meet').length,
    color: C.danger,
  },
];

const SCORE_HISTOGRAM = [
  { range: '0–1', count: ACTIVE.filter((e) => e.avg_score < 1).length, color: C.danger },
  {
    range: '1–2',
    count: ACTIVE.filter((e) => e.avg_score >= 1 && e.avg_score < 2).length,
    color: C.danger,
  },
  {
    range: '2–3',
    count: ACTIVE.filter((e) => e.avg_score >= 2 && e.avg_score < 3).length,
    color: C.warning,
  },
  {
    range: '3–4',
    count: ACTIVE.filter((e) => e.avg_score >= 3 && e.avg_score < 4).length,
    color: C.primaryInk,
  },
  { range: '4–5', count: ACTIVE.filter((e) => e.avg_score >= 4).length, color: C.primary },
];

function KpiTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: 'success' | 'warn' | 'danger' | 'primary';
}) {
  const colorMap = {
    success: 'text-semantic-success',
    warn: 'text-semantic-warning',
    danger: 'text-danger-ink',
    primary: 'text-primary-ink',
  };
  return (
    <div className="rounded-xl border border-hairline bg-surface-1 px-4 py-3.5 flex flex-col gap-1">
      <p className="text-caption text-ink-subtle uppercase tracking-[0.06em]">{label}</p>
      <p
        className={`text-[28px] font-semibold leading-none tracking-tight ${accent ? colorMap[accent] : 'text-ink'}`}
      >
        {value}
      </p>
      {sub && <p className="text-caption text-ink-subtle">{sub}</p>}
    </div>
  );
}

function GenericTooltip({
  active,
  payload,
  label,
  valueLabel,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  valueLabel?: string;
}) {
  if (!active || !payload?.[0]) return null;
  return (
    <div className="rounded-lg border border-hairline bg-surface-2 px-3 py-2 shadow-lg text-body-sm">
      <p className="text-ink font-medium">{label}</p>
      <p className="text-ink-muted">
        {valueLabel ?? 'Count'}: <span className="text-ink font-medium">{payload[0].value}</span>
      </p>
    </div>
  );
}

function StackedTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-hairline bg-surface-2 px-3 py-2 shadow-lg text-body-sm space-y-1">
      <p className="text-ink font-medium">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-ink-muted">
          {p.name}: <span className="text-ink font-medium">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

function ExecutivePage() {
  const canView = usePermission('performance.dashboard.executive.read');
  const [timeRange, setTimeRange] = useTimeRange('quarter');

  if (!canView) {
    return (
      <PageChrome breadcrumb={['ARIA']} title="Executive Dashboard">
        <div className="page-container py-16 flex flex-col items-center gap-3 text-center">
          <Lock className="size-8 text-ink-subtle" />
          <p className="text-body-sm text-ink-muted">Executive dashboard requires the BOD role.</p>
        </div>
      </PageChrome>
    );
  }

  const accountChartData = ACCOUNT_STATS.sort((a, b) => b.count - a.count).map((a) => ({
    name: a.account.replace('Account ', 'Acct '),
    Healthy: a.count - a.riskCount,
    'At Risk': a.riskCount,
  }));

  return (
    <PageChrome breadcrumb={['ARIA']} title="Executive Dashboard">
      <div className="page-container py-6 space-y-6">
        <TimeRangeFilter value={timeRange} onChange={setTimeRange} />
        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiTile label="Workforce" value={ACTIVE.length} sub="active employees" />
          <KpiTile
            label="Talent Health"
            value={`${TALENT_HEALTH_PCT}%`}
            sub="score ≥ 3.5"
            accent={
              TALENT_HEALTH_PCT >= 70 ? 'success' : TALENT_HEALTH_PCT >= 50 ? 'warn' : 'danger'
            }
          />
          <KpiTile
            label="Avg Performance"
            value={AVG_SCORE.toFixed(2)}
            sub="out of 5.00"
            accent={AVG_SCORE >= SCORE_THRESHOLDS.good ? 'primary' : 'warn'}
          />
          <KpiTile
            label="At-Risk Talent"
            value={AT_RISK.length}
            sub="high + watch"
            accent={AT_RISK.length > 20 ? 'danger' : AT_RISK.length > 10 ? 'warn' : undefined}
          />
          <KpiTile
            label="Promotion-Ready"
            value={PROMOTION_READY.length}
            sub="readiness ≥ 80%"
            accent="success"
          />
          <KpiTile
            label="Utilization"
            value={`${UTILIZATION_PCT}%`}
            sub="billable allocation"
            accent={UTILIZATION_PCT >= 75 ? 'primary' : 'warn'}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Score distribution histogram */}
          <div className="rounded-xl border border-hairline bg-surface-1 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-hairline bg-surface-2">
              <TrendingUp className="size-4 text-primary" />
              <h3 className="text-body-sm font-semibold text-ink">Score Distribution</h3>
              <span className="ml-auto text-caption text-ink-subtle">
                All {ACTIVE.length} active
              </span>
            </div>
            <div className="px-2 py-4">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={SCORE_HISTOGRAM}
                  margin={{ top: 8, right: 12, bottom: 0, left: -10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={C.hairline} vertical={false} />
                  <XAxis dataKey="range" tick={{ fill: C.subtle, fontSize: 11 }} />
                  <YAxis tick={{ fill: C.subtle, fontSize: 11 }} />
                  <Tooltip
                    content={({ active, payload, label }) => (
                      <GenericTooltip
                        active={active}
                        payload={payload as unknown as { value: number }[]}
                        label={`Score ${String(label ?? '')}`}
                        valueLabel="Employees"
                      />
                    )}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {SCORE_HISTOGRAM.map((entry) => (
                      <Cell key={entry.range} fill={entry.color} fillOpacity={0.9} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tier distribution */}
          <div className="rounded-xl border border-hairline bg-surface-1 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-hairline bg-surface-2">
              <h3 className="text-body-sm font-semibold text-ink">Performance Tier Distribution</h3>
            </div>
            <div className="px-2 py-4">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={TIER_DIST} margin={{ top: 16, right: 12, bottom: 0, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.hairline} vertical={false} />
                  <XAxis dataKey="tier" tick={{ fill: C.subtle, fontSize: 10 }} />
                  <YAxis tick={{ fill: C.subtle, fontSize: 11 }} />
                  <Tooltip
                    content={({ active, payload, label }) => (
                      <GenericTooltip
                        active={active}
                        payload={payload as unknown as { value: number }[]}
                        label={String(label ?? '')}
                        valueLabel="Employees"
                      />
                    )}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {TIER_DIST.map((entry) => (
                      <Cell key={entry.tier} fill={entry.color} fillOpacity={0.9} />
                    ))}
                    <LabelList
                      dataKey="count"
                      position="top"
                      style={{ fill: C.muted, fontSize: 11 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Account-level summary */}
        <div className="rounded-xl border border-hairline bg-surface-1 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-hairline bg-surface-2">
            <Building2 className="size-4 text-primary" />
            <h3 className="text-body-sm font-semibold text-ink">Account-Level Summary</h3>
          </div>

          {/* Stacked bar */}
          <div className="px-2 pt-4 pb-2">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart
                data={accountChartData}
                margin={{ top: 0, right: 16, bottom: 0, left: -10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={C.hairline} vertical={false} />
                <XAxis dataKey="name" tick={{ fill: C.subtle, fontSize: 10 }} />
                <YAxis tick={{ fill: C.subtle, fontSize: 10 }} />
                <Tooltip content={<StackedTooltip />} />
                <Legend
                  iconType="square"
                  iconSize={8}
                  formatter={(v) => <span style={{ color: C.muted, fontSize: 11 }}>{v}</span>}
                />
                <Bar dataKey="Healthy" stackId="a" fill={C.primary} fillOpacity={0.8} />
                <Bar
                  dataKey="At Risk"
                  stackId="a"
                  fill={C.warning}
                  fillOpacity={0.9}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Table */}
          <div className="overflow-x-auto border-t border-hairline">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-hairline">
                  {['Account', 'Headcount', 'Avg Score', 'Health %', 'At Risk', 'Status'].map(
                    (h) => (
                      <th
                        key={h}
                        className={`px-4 py-2.5 text-caption text-ink-subtle font-medium uppercase tracking-[0.06em] ${h === 'Account' ? 'text-left' : 'text-right'}`}
                      >
                        {h}
                      </th>
                    ),
                  )}
                  <th className="px-4 py-2.5 text-left text-caption text-ink-subtle font-medium uppercase tracking-[0.06em]">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {ACCOUNT_STATS.sort((a, b) => b.count - a.count).map((acct) => (
                  <tr key={acct.acct} className="hover:bg-surface-2 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-ink">{acct.account}</td>
                    <td className="px-4 py-2.5 text-right text-ink-muted">{acct.count}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span
                        className={
                          acct.avgScore >= SCORE_THRESHOLDS.good
                            ? 'text-primary-ink font-medium'
                            : acct.avgScore >= SCORE_THRESHOLDS.watch
                              ? 'text-semantic-warning font-medium'
                              : 'text-danger-ink font-medium'
                        }
                      >
                        {acct.avgScore.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-ink-muted">{acct.healthPct}%</td>
                    <td className="px-4 py-2.5 text-right">
                      {acct.riskCount > 0 ? (
                        <span className="text-semantic-warning font-medium">{acct.riskCount}</span>
                      ) : (
                        <span className="text-semantic-success">0</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {acct.healthPct >= 70 ? (
                        <Badge variant="success">Healthy</Badge>
                      ) : acct.healthPct >= 50 ? (
                        <Badge variant="warning">Watch</Badge>
                      ) : (
                        <Badge variant="destructive">At Risk</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5" />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PageChrome>
  );
}
