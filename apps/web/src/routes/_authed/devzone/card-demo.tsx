import { Badge, PageChrome } from '@seta/shared-ui';
import { createFileRoute } from '@tanstack/react-router';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  Lock,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  UserCircle2,
  XCircle,
} from 'lucide-react';

export const Route = createFileRoute('/_authed/devzone/card-demo')({
  component: CardDemoPage,
});

// ─── Mock data ────────────────────────────────────────────────────────────────

const EMPLOYEE = {
  id: 'EMP-031',
  name: 'Nguyen Thi Lan',
  title: 'Senior Software Engineer',
  account: 'Account B — Fintech Platform',
  period: 'April 2026',
  kpi: 72,
  kpiTarget: 85,
  ot: 48,
  otLimit: 40,
  violations: 1,
  allocation: 110,
  normResult: 'Below expectation',
  riskLevel: 'high' as const,
};

const AT_RISK_EMPLOYEES = [
  {
    id: 'EMP-031',
    name: 'Nguyen Thi Lan',
    risk: 'high' as const,
    reason: 'KPI 72% (target 85%), OT 48h exceeds limit, open violation',
    action: 'Schedule 1:1, review workload allocation',
  },
  {
    id: 'EMP-044',
    name: 'Tran Van Duc',
    risk: 'medium' as const,
    reason: 'KPI 78%, allocation 105% for 3 consecutive months',
    action: 'Review project load, consider reallocation',
  },
  {
    id: 'EMP-019',
    name: 'Le Minh Khoa',
    risk: 'medium' as const,
    reason: 'Low peer feedback score, missed 2 milestones',
    action: 'Coaching plan recommended',
  },
];

const ACCOUNT_SUMMARY = {
  account: 'All Accounts',
  total: 124,
  high: 8,
  medium: 22,
  low: 94,
  summary:
    'Overall talent risk is moderate. 8 employees flagged high-risk require immediate manager action. Account B has the highest concentration of risk (3 high-risk employees).',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function RiskBadge({ level }: { level: 'high' | 'medium' | 'low' }) {
  if (level === 'high')
    return (
      <Badge variant="destructive" className="uppercase">
        High risk
      </Badge>
    );
  if (level === 'medium')
    return (
      <Badge variant="warning" className="uppercase">
        Medium risk
      </Badge>
    );
  return (
    <Badge variant="success" className="uppercase">
      Low risk
    </Badge>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-eyebrow uppercase tracking-[0.04em] text-ink-subtle mb-3">{children}</p>
  );
}

function MetaRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-hairline last:border-0">
      <span className="text-body-sm text-ink-muted">{label}</span>
      <span className={`text-body-sm font-medium ${accent ? 'text-danger-ink' : 'text-ink'}`}>
        {value}
      </span>
    </div>
  );
}

// ─── Cards ────────────────────────────────────────────────────────────────────

function EmployeeProfileCard() {
  const kpiOk = EMPLOYEE.kpi >= EMPLOYEE.kpiTarget;
  const otOk = EMPLOYEE.ot <= EMPLOYEE.otLimit;

  return (
    <div className="rounded-xl border border-hairline bg-surface-1 overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3 px-4 py-3.5 border-b border-hairline bg-surface-2">
        <div className="size-9 rounded-full bg-primary-tint flex items-center justify-center shrink-0">
          <UserCircle2 className="size-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-card-title font-semibold text-ink tracking-tight leading-tight">
              {EMPLOYEE.name}
            </h3>
            <RiskBadge level={EMPLOYEE.riskLevel} />
          </div>
          <p className="text-body-sm text-ink-muted mt-0.5">{EMPLOYEE.title}</p>
        </div>
        <span className="text-caption text-ink-subtle font-mono shrink-0">{EMPLOYEE.id}</span>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-4">
        <div>
          <MetaRow label="Account" value={EMPLOYEE.account} />
          <MetaRow label="Review period" value={EMPLOYEE.period} />
        </div>

        {/* KPI */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-body-sm text-ink-muted">KPI Score</span>
            <span
              className={`text-body-sm font-semibold ${kpiOk ? 'text-semantic-success' : 'text-danger-ink'}`}
            >
              {EMPLOYEE.kpi}% / {EMPLOYEE.kpiTarget}% target
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${kpiOk ? 'bg-semantic-success' : 'bg-danger'}`}
              style={{ width: `${EMPLOYEE.kpi}%` }}
            />
          </div>
        </div>

        <div>
          <MetaRow
            label="Overtime (month)"
            value={`${EMPLOYEE.ot}h / ${EMPLOYEE.otLimit}h limit`}
            accent={!otOk}
          />
          <MetaRow
            label="Open violations"
            value={EMPLOYEE.violations > 0 ? `${EMPLOYEE.violations} open` : 'None'}
            accent={EMPLOYEE.violations > 0}
          />
          <MetaRow
            label="Allocation"
            value={`${EMPLOYEE.allocation}%`}
            accent={EMPLOYEE.allocation > 100}
          />
          <MetaRow label="NORM result" value={EMPLOYEE.normResult} accent />
        </div>

        {/* Risk flags */}
        <div className="rounded-lg bg-danger-tint border border-danger/30 px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle className="size-4 text-danger-ink mt-0.5 shrink-0" />
          <div>
            <p className="text-body-sm font-medium text-danger-ink">Risk signals detected</p>
            <ul className="mt-1 space-y-0.5 text-caption text-danger-ink/80">
              <li>• KPI below target for 2 consecutive months</li>
              <li>• Overtime exceeds policy limit (+8h)</li>
              <li>• 1 unresolved compliance violation</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function RiskSummaryCard() {
  return (
    <div className="rounded-xl border border-hairline bg-surface-1 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-hairline bg-surface-2">
        <TrendingDown className="size-4 text-danger-ink" />
        <h3 className="text-body-sm font-semibold text-ink">
          At-risk employees — Account B, April 2026
        </h3>
      </div>
      <div className="divide-y divide-hairline">
        {AT_RISK_EMPLOYEES.map((emp) => (
          <div key={emp.id} className="px-4 py-3 flex items-start gap-3">
            <div className="size-7 rounded-full bg-surface-3 flex items-center justify-center shrink-0 mt-0.5">
              <UserCircle2 className="size-4 text-ink-muted" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-body-sm font-medium text-ink">{emp.name}</span>
                <span className="text-caption text-ink-subtle font-mono">{emp.id}</span>
                <RiskBadge level={emp.risk} />
              </div>
              <p className="text-caption text-ink-muted mt-0.5">{emp.reason}</p>
              <p className="text-caption text-primary mt-1">→ {emp.action}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccountSummaryCard() {
  const pctHigh = Math.round((ACCOUNT_SUMMARY.high / ACCOUNT_SUMMARY.total) * 100);
  const pctMedium = Math.round((ACCOUNT_SUMMARY.medium / ACCOUNT_SUMMARY.total) * 100);
  const pctLow = 100 - pctHigh - pctMedium;

  return (
    <div className="rounded-xl border border-hairline bg-surface-1 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-hairline bg-surface-2">
        <BarChart3 className="size-4 text-primary" />
        <h3 className="text-body-sm font-semibold text-ink">Talent risk overview — All accounts</h3>
      </div>
      <div className="px-4 py-3 space-y-4">
        {/* Stat tiles */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-danger-tint border border-danger-border px-3 py-2.5 text-center">
            <p className="text-[22px] font-semibold text-danger-ink leading-none">
              {ACCOUNT_SUMMARY.high}
            </p>
            <p className="text-eyebrow uppercase tracking-wide text-danger-ink/70 mt-1">High</p>
          </div>
          <div className="rounded-lg bg-semantic-warning-tint border border-semantic-warning/20 px-3 py-2.5 text-center">
            <p className="text-[22px] font-semibold text-semantic-warning leading-none">
              {ACCOUNT_SUMMARY.medium}
            </p>
            <p className="text-eyebrow uppercase tracking-wide text-semantic-warning/70 mt-1">
              Medium
            </p>
          </div>
          <div className="rounded-lg bg-semantic-success-tint border border-semantic-success/20 px-3 py-2.5 text-center">
            <p className="text-[22px] font-semibold text-semantic-success leading-none">
              {ACCOUNT_SUMMARY.low}
            </p>
            <p className="text-eyebrow uppercase tracking-wide text-semantic-success/70 mt-1">
              Low
            </p>
          </div>
        </div>

        {/* Risk bar */}
        <div>
          <div className="flex h-2 rounded-full overflow-hidden gap-px">
            <div className="bg-danger" style={{ width: `${pctHigh}%` }} />
            <div className="bg-semantic-warning" style={{ width: `${pctMedium}%` }} />
            <div className="bg-semantic-success" style={{ width: `${pctLow}%` }} />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-caption text-ink-subtle">{pctHigh}% high</span>
            <span className="text-caption text-ink-subtle">
              {ACCOUNT_SUMMARY.total} total employees
            </span>
          </div>
        </div>

        <p className="text-body-sm text-ink-muted leading-relaxed">{ACCOUNT_SUMMARY.summary}</p>
      </div>
    </div>
  );
}

function HumanReviewFlagCard() {
  return (
    <div className="rounded-xl border-[1.5px] border-semantic-warning/50 bg-canvas overflow-hidden shadow-[0_0_0_4px_var(--color-semantic-warning-tint)]">
      <div className="flex items-center gap-2.5 px-3.5 py-2 bg-semantic-warning-tint border-b border-semantic-warning/30">
        <ShieldCheck className="size-3.5 text-semantic-warning shrink-0" />
        <span className="text-body-sm font-semibold text-semantic-warning">
          Requires human review
        </span>
        <span className="ml-auto rounded-sm bg-semantic-warning-tint px-1.5 text-[10px] font-medium uppercase tracking-wide text-semantic-warning">
          Sensitive
        </span>
      </div>
      <div className="px-3.5 py-3 space-y-2.5">
        <p className="text-caption text-ink-subtle">
          The following conclusion involves sensitive performance data and must be reviewed by an
          authorized HR officer before being shared or actioned.
        </p>
        <div className="rounded-lg border border-hairline bg-surface-1 px-3 py-2.5">
          <p className="text-body-sm font-medium text-ink">
            EMP-031 is flagged for potential performance improvement plan (PIP) consideration based
            on 3-month KPI trend.
          </p>
        </div>
        <div className="flex items-center gap-1.5 mt-3">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md bg-semantic-warning px-3 py-1.5 text-body-sm font-semibold text-white shadow-sm hover:opacity-90 transition"
          >
            <CheckCircle2 className="size-3.5" />
            Acknowledge &amp; approve
          </button>
          <button
            type="button"
            className="ml-auto rounded-md px-3 py-1.5 text-body-sm text-ink-muted hover:bg-surface-2 hover:text-ink transition"
          >
            <XCircle className="size-3.5 inline mr-1" />
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}

function AccessDeniedCard() {
  return (
    <div className="rounded-xl border border-hairline bg-surface-1 overflow-hidden">
      <div className="flex items-start gap-3 px-4 py-4">
        <div className="size-9 rounded-full bg-surface-3 flex items-center justify-center shrink-0">
          <Lock className="size-4 text-ink-muted" />
        </div>
        <div>
          <p className="text-body-sm font-semibold text-ink">Access restricted</p>
          <p className="text-body-sm text-ink-muted mt-0.5">
            Your current role <span className="font-medium text-ink">Leader</span> does not have
            permission to view promotion readiness data or sensitive HR notes.
          </p>
          <p className="text-caption text-ink-subtle mt-2">
            Contact your HR administrator if you need access to this information.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <span className="label-chip label-chip--purple">Leader role</span>
            <span className="text-caption text-ink-subtle">→ HR role required</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function RoleStatusCard() {
  const roles = [
    { id: 'hr', label: 'HR', active: false, desc: 'Full employee data + sensitive fields' },
    { id: 'leader', label: 'Leader', active: true, desc: 'Team KPI, risk flags, no salary/PIP' },
    { id: 'bod', label: 'BOD', active: false, desc: 'Account-level summaries only' },
  ];

  return (
    <div className="rounded-xl border border-hairline bg-surface-1 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-hairline bg-surface-2">
        <Sparkles className="size-4 text-violet-400" />
        <h3 className="text-body-sm font-semibold text-ink">RBAC role simulation</h3>
        <span className="ml-auto text-caption text-ink-subtle">Demo only</span>
      </div>
      <div className="px-4 py-3 space-y-2">
        {roles.map((r) => (
          <div
            key={r.id}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 border transition ${
              r.active
                ? 'border-primary-border bg-primary-tint'
                : 'border-hairline bg-surface-2 opacity-60'
            }`}
          >
            <div
              className={`size-2 rounded-full shrink-0 ${r.active ? 'bg-primary' : 'bg-ink-subtle'}`}
            />
            <div className="flex-1 min-w-0">
              <span
                className={`text-body-sm font-medium ${r.active ? 'text-primary-ink' : 'text-ink'}`}
              >
                {r.label}
              </span>
              <p className="text-caption text-ink-subtle truncate">{r.desc}</p>
            </div>
            {r.active && (
              <span className="text-caption text-primary font-medium shrink-0">Active</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentResponseCard() {
  return (
    <div className="rounded-xl border border-hairline bg-surface-1 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-hairline bg-surface-2">
        <div className="size-5 rounded-md bg-primary-tint flex items-center justify-center">
          <Sparkles className="size-3 text-primary" />
        </div>
        <span className="text-body-sm font-medium text-ink">ARIA</span>
        <span className="ml-auto flex items-center gap-1 text-caption text-ink-subtle">
          <Clock className="size-3" />
          2s ago
        </span>
      </div>
      <div className="px-4 py-3 space-y-3">
        <p className="text-body-sm text-ink leading-relaxed">
          Here is the performance profile for{' '}
          <span className="font-medium">EMP-031 — Nguyen Thi Lan</span> for April 2026.
        </p>
        <div className="rounded-lg border border-hairline bg-surface-2 px-3 py-2.5 space-y-1">
          <div className="flex justify-between text-body-sm">
            <span className="text-ink-muted">KPI</span>
            <span className="text-danger-ink font-medium">72% (target 85%)</span>
          </div>
          <div className="flex justify-between text-body-sm">
            <span className="text-ink-muted">Overtime</span>
            <span className="text-danger-ink font-medium">48h (+8h over limit)</span>
          </div>
          <div className="flex justify-between text-body-sm">
            <span className="text-ink-muted">Violations</span>
            <span className="text-danger-ink font-medium">1 open</span>
          </div>
          <div className="flex justify-between text-body-sm">
            <span className="text-ink-muted">NORM result</span>
            <span className="text-ink font-medium">Below expectation</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant="destructive">High risk</Badge>
          <span className="text-caption text-ink-subtle">Flagged for review</span>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function CardDemoPage() {
  return (
    <PageChrome breadcrumb={['Development Zone']} title="Card demo">
      <div className="page-container py-6 space-y-10">
        <section>
          <SectionLabel>Employee profile report</SectionLabel>
          <div className="max-w-md">
            <EmployeeProfileCard />
          </div>
        </section>

        <section>
          <SectionLabel>Agent response card (inline transcript)</SectionLabel>
          <div className="max-w-md">
            <AgentResponseCard />
          </div>
        </section>

        <section>
          <SectionLabel>Human review flag (sensitive conclusion)</SectionLabel>
          <div className="max-w-md">
            <HumanReviewFlagCard />
          </div>
        </section>

        <section>
          <SectionLabel>At-risk employee list (leader view)</SectionLabel>
          <div className="max-w-xl">
            <RiskSummaryCard />
          </div>
        </section>

        <section>
          <SectionLabel>Account-level summary (BOD view)</SectionLabel>
          <div className="max-w-sm">
            <AccountSummaryCard />
          </div>
        </section>

        <section>
          <SectionLabel>Access denied (RBAC guardrail)</SectionLabel>
          <div className="max-w-md">
            <AccessDeniedCard />
          </div>
        </section>

        <section>
          <SectionLabel>Role switcher (demo simulation)</SectionLabel>
          <div className="max-w-xs">
            <RoleStatusCard />
          </div>
        </section>
      </div>
    </PageChrome>
  );
}
