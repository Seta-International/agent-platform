import { Badge, PageChrome } from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { AlertTriangle, Loader2, Lock, TrendingDown, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import {
  type AtRiskMember,
  ForbiddenError,
  fetchPeriods,
  fetchTeamDashboard,
  type RiskFlag,
  type TeamDashboard,
} from '@/modules/aria/api/client.ts';
import { PeriodFilter } from '@/modules/aria/PeriodFilter.tsx';
import { usePermission } from '@/modules/identity/components/Can.tsx';

export const Route = createFileRoute('/_authed/aria/team')({
  component: TeamPage,
});

// Score colour thresholds — dashboard display config (mirrors the spec's SCORE_THRESHOLDS).
const SCORE_THRESHOLDS = { excellent: 4.5, good: 3.5, watch: 2.8 } as const;

// Hardcoded hex — CSS vars don't resolve inside recharts SVG
const C = {
  primary: '#0047FF',
  danger: '#e5484d',
  warning: '#f4a73a',
  success: '#27a644',
  subtle: '#8a8f98',
  muted: '#d0d6e0',
  hairline: '#23252a',
  surface2: '#181a1d',
  surface3: '#23252a',
} as const;

interface QuadrantPoint {
  x: number;
  y: number;
  z: number;
  id: string;
  role: string;
  risk: RiskFlag;
}

function stripDept(dept: string): string {
  return dept.replace('IT - ', '').replace('Admin - ', '');
}

function riskBadge(flag: string) {
  if (flag === 'High') return <Badge variant="destructive">High</Badge>;
  if (flag === 'Watch') return <Badge variant="warning">Watch</Badge>;
  if (flag === 'Minor') return <Badge variant="warning">Minor</Badge>;
  return <Badge variant="success">None</Badge>;
}

function KpiTile({
  label,
  value,
  sub,
  danger,
  warn,
}: {
  label: string;
  value: string | number;
  sub?: string;
  danger?: boolean;
  warn?: boolean;
}) {
  const color = danger ? 'text-danger-ink' : warn ? 'text-semantic-warning' : 'text-ink';
  return (
    <div className="rounded-xl border border-hairline bg-surface-1 px-4 py-3.5 flex flex-col gap-1">
      <p className="text-caption text-ink-subtle uppercase tracking-[0.06em]">{label}</p>
      <p className={`text-[28px] font-semibold leading-none tracking-tight ${color}`}>{value}</p>
      {sub && <p className="text-caption text-ink-subtle">{sub}</p>}
    </div>
  );
}

function QuadrantTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: QuadrantPoint }[];
}) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-hairline bg-surface-2 px-3 py-2 shadow-lg text-body-sm max-w-[200px]">
      <p className="text-ink font-medium truncate">{d.role}</p>
      <p className="text-ink-subtle text-caption">{d.id}</p>
      <p className="text-ink-muted mt-1">
        Score: <span className="text-ink font-medium">{d.y}</span>
      </p>
      <p className="text-ink-muted">
        Readiness: <span className="text-ink font-medium">{d.x}%</span>
      </p>
    </div>
  );
}

function BarTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.[0]) return null;
  return (
    <div className="rounded-lg border border-hairline bg-surface-2 px-3 py-2 shadow-lg text-body-sm">
      <p className="text-ink font-medium">{label}</p>
      <p className="text-ink-muted">
        Avg score: <span className="text-ink font-medium">{payload[0].value}</span>
      </p>
    </div>
  );
}

function PieTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { name: string; value: number }[];
}) {
  if (!active || !payload?.[0]) return null;
  return (
    <div className="rounded-lg border border-hairline bg-surface-2 px-3 py-2 shadow-lg text-body-sm">
      <p className="text-ink font-medium">{payload[0].name}</p>
      <p className="text-ink-muted">{payload[0].value} employees</p>
    </div>
  );
}

function deptBarColor(avg: number): string {
  if (avg >= SCORE_THRESHOLDS.good) return C.primary;
  if (avg >= SCORE_THRESHOLDS.watch) return C.warning;
  return C.danger;
}

function LockScreen({ message }: { message: string }) {
  return (
    <div className="page-container py-16 flex flex-col items-center gap-3 text-center">
      <Lock className="size-8 text-ink-subtle" />
      <p className="text-body-sm text-ink-muted">{message}</p>
    </div>
  );
}

interface TeamView {
  data: TeamDashboard;
  quadrant: QuadrantPoint[];
  deptScores: { dept: string; avg: number; count: number }[];
  allocPie: { name: string; value: number; color: string }[];
  riskRows: AtRiskMember[];
}

function buildView(data: TeamDashboard): TeamView {
  const quadrant: QuadrantPoint[] = data.talent_quadrant.map((m) => ({
    x: parseFloat((m.readiness * 100).toFixed(1)),
    y: parseFloat(m.avg_score.toFixed(2)),
    z: m.risk_flag === 'High' ? 120 : m.risk_flag === 'Watch' ? 80 : 50,
    id: m.member_id,
    role: m.role_title,
    risk: m.risk_flag,
  }));

  const deptScores = data.dept_scores
    .map((d) => ({
      dept: stripDept(d.department),
      avg: parseFloat(d.avg_score.toFixed(2)),
      count: d.headcount,
    }))
    .sort((a, b) => b.avg - a.avg);

  const allocPie = [
    { name: 'Active', value: data.allocation_distribution.active, color: C.primary },
    { name: 'Bench', value: data.allocation_distribution.bench, color: C.subtle },
    { name: 'Overloaded', value: data.allocation_distribution.overloaded, color: C.warning },
  ];

  return { data, quadrant, deptScores, allocPie, riskRows: data.at_risk };
}

function TeamPage() {
  const canView = usePermission('performance.dashboard.team.read');
  const [selected, setSelected] = useState<string | null>(null);

  const periodsQuery = useQuery({
    queryKey: ['performance', 'dashboard', 'periods'],
    queryFn: ({ signal }) => fetchPeriods(signal),
    enabled: canView,
  });
  const periods = periodsQuery.data ?? [];
  const selectedPeriod = selected ?? periods[0] ?? null;

  const query = useQuery({
    queryKey: ['performance', 'dashboard', 'team', selectedPeriod],
    queryFn: ({ signal }) => fetchTeamDashboard({ to_period: selectedPeriod ?? undefined }, signal),
    enabled: canView && selectedPeriod !== null,
  });

  const view = useMemo(() => (query.data ? buildView(query.data) : null), [query.data]);

  if (!canView) {
    return (
      <PageChrome breadcrumb={['ARIA']} title="Team Dashboard">
        <LockScreen message="Team dashboard requires the Manager or BOD role." />
      </PageChrome>
    );
  }

  const loading = periodsQuery.isLoading || (selectedPeriod !== null && query.isLoading);
  const errored = periodsQuery.isError || (selectedPeriod !== null && query.isError);
  const error = periodsQuery.error ?? query.error;

  return (
    <PageChrome breadcrumb={['ARIA']} title="Team Dashboard">
      <div className="page-container py-6 space-y-6">
        <PeriodFilter
          periods={periods}
          value={selectedPeriod}
          onChange={setSelected}
          disabled={loading}
        />

        {loading && (
          <div className="py-24 flex flex-col items-center gap-3 text-center">
            <Loader2 className="size-6 text-ink-subtle animate-spin" />
            <p className="text-body-sm text-ink-muted">Loading team performance…</p>
          </div>
        )}

        {!loading &&
          errored &&
          (error instanceof ForbiddenError ? (
            <LockScreen message="Team dashboard requires the Manager or BOD role." />
          ) : (
            <div className="py-24 flex flex-col items-center gap-3 text-center">
              <AlertTriangle className="size-6 text-danger-ink" />
              <p className="text-body-sm text-ink-muted">
                Couldn't load team performance. Please try again.
              </p>
              <button
                type="button"
                onClick={() => {
                  void periodsQuery.refetch();
                  void query.refetch();
                }}
                className="px-3 py-1.5 rounded-md border border-hairline text-body-sm text-ink hover:bg-surface-2 transition-colors"
              >
                Retry
              </button>
            </div>
          ))}

        {!loading && !errored && view && view.data.kpis.active_count === 0 && (
          <div className="py-24 flex flex-col items-center gap-3 text-center">
            <Users className="size-6 text-ink-subtle" />
            <p className="text-body-sm text-ink-muted">No active team members for this period.</p>
          </div>
        )}

        {!loading && !errored && view && view.data.kpis.active_count > 0 && (
          <TeamContent view={view} />
        )}
      </div>
    </PageChrome>
  );
}

function TeamContent({ view }: { view: TeamView }) {
  const { kpis } = view.data;
  return (
    <>
      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiTile label="Active" value={kpis.active_count} sub="headcount" />
        <KpiTile
          label="Avg Score"
          value={kpis.avg_score.toFixed(2)}
          sub="out of 5.00"
          warn={kpis.avg_score < SCORE_THRESHOLDS.good}
        />
        <KpiTile
          label="High Risk"
          value={kpis.high_risk_count}
          sub="employees"
          danger={kpis.high_risk_count > 0}
        />
        <KpiTile
          label="Declining"
          value={kpis.declining_count}
          sub="T3 → T4"
          warn={kpis.declining_count > 20}
        />
        <KpiTile
          label="Overloaded"
          value={kpis.overloaded_count}
          sub="employees"
          warn={kpis.overloaded_count > 0}
        />
        <KpiTile label="On Bench" value={kpis.bench_count} sub="employees" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Talent-Risk Quadrant */}
        <div className="rounded-xl border border-hairline bg-surface-1 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-hairline bg-surface-2">
            <Users className="size-4 text-primary" />
            <h3 className="text-body-sm font-semibold text-ink">Talent-Risk Quadrant</h3>
            <span className="ml-auto text-caption text-ink-subtle">Readiness vs Score</span>
          </div>
          <div className="px-2 py-4">
            <ResponsiveContainer width="100%" height={260}>
              <ScatterChart margin={{ top: 8, right: 16, bottom: 16, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.hairline} />
                <XAxis
                  dataKey="x"
                  type="number"
                  name="Readiness"
                  domain={[0, 100]}
                  ticks={[0, 20, 40, 60, 80, 100]}
                  tick={{ fill: C.subtle, fontSize: 10 }}
                  label={{
                    value: 'Readiness %',
                    position: 'insideBottom',
                    offset: -8,
                    fill: C.subtle,
                    fontSize: 10,
                  }}
                />
                <YAxis
                  dataKey="y"
                  type="number"
                  name="Score"
                  domain={[0, 5]}
                  ticks={[0, 1, 2, 3, 4, 5]}
                  tick={{ fill: C.subtle, fontSize: 10 }}
                />
                <ZAxis dataKey="z" range={[30, 140]} />
                <Tooltip content={<QuadrantTooltip />} />
                <Scatter
                  data={view.quadrant.filter((d) => d.risk === 'High')}
                  fill={C.danger}
                  fillOpacity={0.8}
                  name="High"
                />
                <Scatter
                  data={view.quadrant.filter((d) => d.risk === 'Watch')}
                  fill={C.warning}
                  fillOpacity={0.8}
                  name="Watch"
                />
                <Scatter
                  data={view.quadrant.filter((d) => d.risk !== 'High' && d.risk !== 'Watch')}
                  fill={C.primary}
                  fillOpacity={0.5}
                  name="OK"
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(v) => <span style={{ color: C.muted, fontSize: 11 }}>{v}</span>}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Dept avg score bar */}
        <div className="rounded-xl border border-hairline bg-surface-1 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-hairline bg-surface-2">
            <TrendingDown className="size-4 text-ink-subtle" />
            <h3 className="text-body-sm font-semibold text-ink">Avg Score by Department</h3>
          </div>
          <div className="px-2 py-4">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={view.deptScores}
                layout="vertical"
                margin={{ top: 0, right: 24, bottom: 0, left: 60 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={C.hairline} horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, 5]}
                  ticks={[0, 1, 2, 3, 4, 5]}
                  tick={{ fill: C.subtle, fontSize: 10 }}
                />
                <YAxis
                  dataKey="dept"
                  type="category"
                  tick={{ fill: C.muted, fontSize: 10 }}
                  width={60}
                />
                <Tooltip content={<BarTooltip />} />
                <Bar dataKey="avg" radius={[0, 4, 4, 0]}>
                  {view.deptScores.map((entry) => (
                    <Cell key={entry.dept} fill={deptBarColor(entry.avg)} fillOpacity={0.9} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Allocation donut */}
        <div className="rounded-xl border border-hairline bg-surface-1 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-hairline bg-surface-2">
            <h3 className="text-body-sm font-semibold text-ink">Allocation Status</h3>
          </div>
          <div className="px-4 py-4 flex flex-col items-center gap-4">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={view.allocPie}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {view.allocPie.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} fillOpacity={0.9} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-1.5 w-full">
              {view.allocPie.map((entry) => (
                <div key={entry.name} className="flex items-center justify-between text-body-sm">
                  <span className="flex items-center gap-2 text-ink-muted">
                    <span
                      className="size-2 rounded-full shrink-0"
                      style={{ background: entry.color }}
                    />
                    {entry.name}
                  </span>
                  <span className="text-ink font-medium">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* At-risk table */}
        <div className="lg:col-span-2 rounded-xl border border-hairline bg-surface-1 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-hairline bg-surface-2">
            <AlertTriangle className="size-4 text-danger-ink" />
            <h3 className="text-body-sm font-semibold text-ink">At-Risk Employees</h3>
            <span className="ml-auto text-caption text-ink-subtle">
              {kpis.high_risk_count} high · {kpis.watch_count} watch
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-hairline">
                  {['ID', 'Role', 'Dept', 'Score', 'Risk', 'Note'].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-2.5 text-caption text-ink-subtle font-medium uppercase tracking-[0.06em]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {view.riskRows.map((emp) => (
                  <tr key={emp.member_id} className="hover:bg-surface-2 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-caption text-ink-subtle">
                      {emp.member_id}
                    </td>
                    <td className="px-4 py-2.5 text-ink truncate max-w-[140px]">
                      {emp.role_title}
                    </td>
                    <td className="px-4 py-2.5 text-ink-muted truncate max-w-[120px]">
                      {stripDept(emp.department)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={
                          emp.avg_score < SCORE_THRESHOLDS.watch
                            ? 'text-danger-ink font-medium'
                            : emp.avg_score < SCORE_THRESHOLDS.good
                              ? 'text-semantic-warning font-medium'
                              : 'text-ink'
                        }
                      >
                        {emp.avg_score.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">{riskBadge(emp.risk_flag)}</td>
                    <td className="px-4 py-2.5 text-ink-muted text-caption max-w-[180px] truncate">
                      {emp.perf_risk_note}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
