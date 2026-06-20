import { Badge, PageChrome } from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { AlertTriangle, Building2, Loader2, Lock, TrendingUp } from 'lucide-react';
import { useState } from 'react';
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
import { ForbiddenError, fetchOrgDashboard, fetchPeriods } from '@/modules/aria/api/client.ts';
import { PeriodFilter } from '@/modules/aria/PeriodFilter.tsx';
import { usePermission } from '@/modules/identity/components/Can.tsx';

export const Route = createFileRoute('/_authed/aria/executive')({
  component: ExecutivePage,
});

const SCORE_THRESHOLDS = { good: 3.5, watch: 2.8 } as const;

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

const HISTOGRAM_COLOR: Record<string, string> = {
  '0–1': C.danger,
  '1–2': C.danger,
  '2–3': C.warning,
  '3–4': C.primaryInk,
  '4–5': C.primary,
};

const TIER_SHORT: Record<string, string> = {
  'Exceeds Expectations': 'Exceeds',
  'Meets Expectations': 'Meets',
  'Partially Meets': 'Partially',
  'Does Not Meet': 'Does Not Meet',
};
const TIER_COLOR: Record<string, string> = {
  'Exceeds Expectations': C.primary,
  'Meets Expectations': C.primaryInk,
  'Partially Meets': C.warning,
  'Does Not Meet': C.danger,
};

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

function StateBlock({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="page-container py-16 flex flex-col items-center gap-3 text-center">
      {icon}
      <p className="text-body-sm text-ink-muted">{children}</p>
    </div>
  );
}

function ExecutivePage() {
  const canView = usePermission('performance.dashboard.executive.read');
  const [selected, setSelected] = useState<string | null>(null);

  const periodsQuery = useQuery({
    queryKey: ['performance', 'dashboard', 'periods'],
    queryFn: ({ signal }) => fetchPeriods(signal),
    enabled: canView,
  });
  const periods = periodsQuery.data ?? [];
  const selectedPeriod = selected ?? periods[0] ?? null;

  const query = useQuery({
    queryKey: ['performance', 'dashboard', 'org', selectedPeriod],
    queryFn: ({ signal }) => fetchOrgDashboard({ to_period: selectedPeriod ?? undefined }, signal),
    enabled: canView && selectedPeriod !== null,
  });

  if (!canView) {
    return (
      <PageChrome breadcrumb={['ARIA']} title="Executive Dashboard">
        <StateBlock icon={<Lock className="size-8 text-ink-subtle" />}>
          Executive dashboard requires the BOD role.
        </StateBlock>
      </PageChrome>
    );
  }

  const loading = periodsQuery.isLoading || (selectedPeriod !== null && query.isLoading);
  const errored = periodsQuery.isError || (selectedPeriod !== null && query.isError);
  const error = periodsQuery.error ?? query.error;
  const noPeriods = !periodsQuery.isLoading && !periodsQuery.isError && periods.length === 0;
  const org = query.data ?? null;

  const histogram = org
    ? org.score_histogram.map((h) => ({ range: h.bucket, count: h.count }))
    : [];
  const tierDist = org
    ? org.tier_distribution.map((t) => ({
        tier: TIER_SHORT[t.tier] ?? t.tier,
        tierFull: t.tier,
        count: t.count,
      }))
    : [];
  const accountChartData = org
    ? org.account_summary.map((a) => ({
        name: a.account_name.replace('Account ', 'Acct '),
        Healthy: a.headcount - a.risk_count,
        'At Risk': a.risk_count,
      }))
    : [];

  return (
    <PageChrome breadcrumb={['ARIA']} title="Executive Dashboard">
      <div className="page-container py-6 space-y-6">
        <PeriodFilter
          periods={periods}
          value={selectedPeriod}
          onChange={setSelected}
          disabled={loading}
        />

        {loading && (
          <StateBlock icon={<Loader2 className="size-6 text-ink-subtle animate-spin" />}>
            Loading organisation performance…
          </StateBlock>
        )}

        {!loading &&
          errored &&
          (error instanceof ForbiddenError ? (
            <StateBlock icon={<Lock className="size-8 text-ink-subtle" />}>
              Executive dashboard requires the BOD role.
            </StateBlock>
          ) : (
            <StateBlock icon={<AlertTriangle className="size-6 text-danger-ink" />}>
              Couldn't load organisation performance. Please try again.
            </StateBlock>
          ))}

        {!loading && !errored && noPeriods && (
          <StateBlock icon={<Building2 className="size-6 text-ink-subtle" />}>
            No performance data available yet.
          </StateBlock>
        )}

        {!loading && !errored && org && (
          <>
            {/* KPI strip */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <KpiTile label="Workforce" value={org.kpis.workforce_count} sub="active employees" />
              <KpiTile
                label="Talent Health"
                value={`${org.kpis.talent_health_pct}%`}
                sub="score ≥ 3.5"
                accent={
                  org.kpis.talent_health_pct >= 70
                    ? 'success'
                    : org.kpis.talent_health_pct >= 50
                      ? 'warn'
                      : 'danger'
                }
              />
              <KpiTile
                label="Avg Performance"
                value={org.kpis.avg_score.toFixed(2)}
                sub="out of 5.00"
                accent={org.kpis.avg_score >= SCORE_THRESHOLDS.good ? 'primary' : 'warn'}
              />
              <KpiTile
                label="At-Risk Talent"
                value={org.kpis.at_risk_count}
                sub="high + watch"
                accent={
                  org.kpis.at_risk_count > 20
                    ? 'danger'
                    : org.kpis.at_risk_count > 10
                      ? 'warn'
                      : undefined
                }
              />
              <KpiTile
                label="Promotion-Ready"
                value={org.kpis.promotion_ready_count}
                sub="readiness ≥ 80%"
                accent="success"
              />
              <KpiTile
                label="Utilization"
                value={`${org.kpis.utilization_pct}%`}
                sub="billable allocation"
                accent={org.kpis.utilization_pct >= 75 ? 'primary' : 'warn'}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Score distribution histogram */}
              <div className="rounded-xl border border-hairline bg-surface-1 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-hairline bg-surface-2">
                  <TrendingUp className="size-4 text-primary" />
                  <h3 className="text-body-sm font-semibold text-ink">Score Distribution</h3>
                  <span className="ml-auto text-caption text-ink-subtle">
                    All {org.kpis.workforce_count} active
                  </span>
                </div>
                <div className="px-2 py-4">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={histogram} margin={{ top: 8, right: 12, bottom: 0, left: -10 }}>
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
                        {histogram.map((entry) => (
                          <Cell
                            key={entry.range}
                            fill={HISTOGRAM_COLOR[entry.range] ?? C.primary}
                            fillOpacity={0.9}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Tier distribution */}
              <div className="rounded-xl border border-hairline bg-surface-1 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-hairline bg-surface-2">
                  <h3 className="text-body-sm font-semibold text-ink">
                    Performance Tier Distribution
                  </h3>
                </div>
                <div className="px-2 py-4">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={tierDist} margin={{ top: 16, right: 12, bottom: 0, left: -10 }}>
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
                        {tierDist.map((entry) => (
                          <Cell
                            key={entry.tierFull}
                            fill={TIER_COLOR[entry.tierFull] ?? C.primaryInk}
                            fillOpacity={0.9}
                          />
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
                            className={`px-4 py-2.5 text-caption text-ink-subtle font-medium uppercase tracking-[0.06em] ${h === 'Account' || h === 'Status' ? 'text-left' : 'text-right'}`}
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {org.account_summary.map((acct) => (
                      <tr key={acct.account_id} className="hover:bg-surface-2 transition-colors">
                        <td className="px-4 py-2.5 font-medium text-ink">{acct.account_name}</td>
                        <td className="px-4 py-2.5 text-right text-ink-muted">{acct.headcount}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span
                            className={
                              acct.avg_score >= SCORE_THRESHOLDS.good
                                ? 'text-primary-ink font-medium'
                                : acct.avg_score >= SCORE_THRESHOLDS.watch
                                  ? 'text-semantic-warning font-medium'
                                  : 'text-danger-ink font-medium'
                            }
                          >
                            {acct.avg_score.toFixed(2)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-ink-muted">
                          {acct.health_pct}%
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {acct.risk_count > 0 ? (
                            <span className="text-semantic-warning font-medium">
                              {acct.risk_count}
                            </span>
                          ) : (
                            <span className="text-semantic-success">0</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {acct.status === 'Healthy' ? (
                            <Badge variant="success">Healthy</Badge>
                          ) : acct.status === 'Watch' ? (
                            <Badge variant="warning">Watch</Badge>
                          ) : (
                            <Badge variant="destructive">At Risk</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </PageChrome>
  );
}
