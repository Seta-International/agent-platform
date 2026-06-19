import { Badge, PageChrome } from '@seta/shared-ui';
import { createFileRoute } from '@tanstack/react-router';
import { AlertTriangle, Lock, TrendingDown, Users } from 'lucide-react';
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
import { EMPLOYEES, SCORE_THRESHOLDS } from '@/modules/aria/mock-data.ts';
import { TimeRangeFilter, useTimeRange } from '@/modules/aria/TimeRangeFilter.tsx';
import { usePermission } from '@/modules/identity/components/Can.tsx';

export const Route = createFileRoute('/_authed/aria/team')({
  component: TeamPage,
});

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

const ACTIVE = EMPLOYEES.filter((e) => e.status === 'Active');
const DECLINERS = ACTIVE.filter((e) => e.score_t4 < e.score_t3);
const HIGH_RISK = ACTIVE.filter((e) => e.risk_flag === 'High');
const WATCH = ACTIVE.filter((e) => e.risk_flag === 'Watch');
const BENCH = ACTIVE.filter((e) => e.allocation_status === 'Bench');
const OVERLOADED = ACTIVE.filter((e) => e.allocation_status === 'Overloaded');
const AVG_SCORE = ACTIVE.reduce((s, e) => s + e.avg_score, 0) / ACTIVE.length;

const RISK_QUADRANT = ACTIVE.map((e) => ({
  x: parseFloat((e.readiness * 100).toFixed(1)),
  y: parseFloat(e.avg_score.toFixed(2)),
  z: e.risk_flag === 'High' ? 120 : e.risk_flag === 'Watch' ? 80 : 50,
  id: e.id,
  role: e.role,
  risk: e.risk_flag,
}));

const DEPT_SCORES = Object.entries(
  ACTIVE.reduce<Record<string, number[]>>((acc, e) => {
    const key = e.dept.replace('IT - ', '').replace('Admin - ', '');
    if (!acc[key]) acc[key] = [];
    acc[key].push(e.avg_score);
    return acc;
  }, {}),
)
  .map(([dept, scores]) => ({
    dept,
    avg: parseFloat((scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(2)),
    count: scores.length,
  }))
  .sort((a, b) => b.avg - a.avg);

const ALLOC_PIE = [
  {
    name: 'Active',
    value: ACTIVE.filter((e) => e.allocation_status === 'Active').length,
    color: C.primary,
  },
  { name: 'Bench', value: BENCH.length, color: C.subtle },
  { name: 'Overloaded', value: OVERLOADED.length, color: C.warning },
];

const RISK_ROWS = [...HIGH_RISK, ...WATCH]
  .sort((a, b) => {
    const order: Record<string, number> = { High: 0, Watch: 1 };
    return (order[a.risk_flag] ?? 2) - (order[b.risk_flag] ?? 2);
  })
  .slice(0, 12);

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
  payload?: { payload: (typeof RISK_QUADRANT)[0] }[];
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

function TeamPage() {
  const canView = usePermission('performance.dashboard.team.read');
  const [timeRange, setTimeRange] = useTimeRange('month');
  if (!canView) {
    return (
      <PageChrome breadcrumb={['ARIA']} title="Team Dashboard">
        <div className="page-container py-16 flex flex-col items-center gap-3 text-center">
          <Lock className="size-8 text-ink-subtle" />
          <p className="text-body-sm text-ink-muted">
            Team dashboard requires the Manager or BOD role.
          </p>
        </div>
      </PageChrome>
    );
  }
  return (
    <PageChrome breadcrumb={['ARIA']} title="Team Dashboard">
      <div className="page-container py-6 space-y-6">
        <TimeRangeFilter value={timeRange} onChange={setTimeRange} />
        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiTile label="Active" value={ACTIVE.length} sub="headcount" />
          <KpiTile
            label="Avg Score"
            value={AVG_SCORE.toFixed(2)}
            sub="out of 5.00"
            warn={AVG_SCORE < SCORE_THRESHOLDS.good}
          />
          <KpiTile
            label="High Risk"
            value={HIGH_RISK.length}
            sub="employees"
            danger={HIGH_RISK.length > 0}
          />
          <KpiTile
            label="Declining"
            value={DECLINERS.length}
            sub="T3 → T4"
            warn={DECLINERS.length > 20}
          />
          <KpiTile
            label="Overloaded"
            value={OVERLOADED.length}
            sub="employees"
            warn={OVERLOADED.length > 0}
          />
          <KpiTile label="On Bench" value={BENCH.length} sub="employees" />
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
                    data={RISK_QUADRANT.filter((d) => d.risk === 'High')}
                    fill={C.danger}
                    fillOpacity={0.8}
                    name="High"
                  />
                  <Scatter
                    data={RISK_QUADRANT.filter((d) => d.risk === 'Watch')}
                    fill={C.warning}
                    fillOpacity={0.8}
                    name="Watch"
                  />
                  <Scatter
                    data={RISK_QUADRANT.filter((d) => d.risk !== 'High' && d.risk !== 'Watch')}
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
                  data={DEPT_SCORES}
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
                    {DEPT_SCORES.map((entry) => (
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
                    data={ALLOC_PIE}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {ALLOC_PIE.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} fillOpacity={0.9} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-1.5 w-full">
                {ALLOC_PIE.map((entry) => (
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
                {HIGH_RISK.length} high · {WATCH.length} watch
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
                  {RISK_ROWS.map((emp) => (
                    <tr key={emp.id} className="hover:bg-surface-2 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-caption text-ink-subtle">
                        {emp.id}
                      </td>
                      <td className="px-4 py-2.5 text-ink truncate max-w-[140px]">{emp.role}</td>
                      <td className="px-4 py-2.5 text-ink-muted truncate max-w-[120px]">
                        {emp.dept.replace('IT - ', '').replace('Admin - ', '')}
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
                        {emp.risk_note}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </PageChrome>
  );
}
