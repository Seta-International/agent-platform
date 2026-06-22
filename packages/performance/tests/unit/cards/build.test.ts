import { describe, expect, it } from 'vitest';
import {
  audienceRoleLabel,
  buildAccessDeniedCard,
  buildAccountSummaryCard,
  buildAtRiskListCard,
  buildEmployeeProfileCard,
  buildHumanReviewFlagCard,
  buildInlineTranscriptCard,
  formatPeriod,
  riskSignals,
  toCardRisk,
} from '../../../src/backend/cards/build.ts';
import { CardPayloadSchema } from '../../../src/backend/cards/schema.ts';
import { evaluateNormRules } from '../../../src/backend/domain/norm-engine/index.ts';
import type { AtRiskEntry, ProfileSnapshot } from '../../../src/backend/domain/schemas.ts';

/** A high-risk single-employee snapshot (KPI At Risk, one open violation). */
function highRiskSnapshot(overrides: Partial<ProfileSnapshot> = {}): ProfileSnapshot {
  return {
    employee: {
      memberId: 'EMP-031',
      name: 'Nguyễn Thị Lan',
      role: 'Senior Software Engineer',
      level: 'L4',
      status: 'active',
      joinDate: '2022-03-01',
      tier: 'Senior',
      score: 2.2,
      managerId: 'TL-BE-002',
      promotionReadiness: null,
      salaryBand: null,
    },
    performance: [
      {
        period: '2026-04',
        kpiScore: 2.2,
        classification: 'At Risk',
        feedbackCategories: ['delivery'],
        trend: 'down',
      },
    ],
    timesheet: [
      { period: '2026-04', otHours: 48, attendancePct: 96, complianceFlag: true, logWorkPct: 98 },
    ],
    violations: {
      riskFlag: true,
      openCount: 1,
      criticalCount: 0,
      history: [{ date: '2026-04-10', severity: 'medium', type: 'process' }],
    },
    allocation: {
      accountId: 'ACC-B',
      projectId: 'ACC-B-P02',
      allocationPct: 110,
      status: 'active',
      overloadFlag: false,
      benchFlag: false,
    },
    missingDatasets: [],
    ...overrides,
  };
}

describe('toCardRisk', () => {
  it('collapses critical into high and passes the rest through', () => {
    expect(toCardRisk('critical')).toBe('high');
    expect(toCardRisk('high')).toBe('high');
    expect(toCardRisk('medium')).toBe('medium');
    expect(toCardRisk('low')).toBe('low');
    expect(toCardRisk('none')).toBe('none');
  });
});

describe('formatPeriod', () => {
  it('renders YYYY-MM as a human month', () => {
    expect(formatPeriod('2026-04')).toBe('April 2026');
  });
  it('falls back gracefully', () => {
    expect(formatPeriod(null)).toBe('current period');
    expect(formatPeriod('Q1')).toBe('Q1');
  });
});

describe('riskSignals', () => {
  it('surfaces risk-bearing classifications and never positive ones or raw numbers', () => {
    const norm = evaluateNormRules(highRiskSnapshot());
    const signals = riskSignals(norm);
    expect(signals).toContain('KPI: At Risk');
    expect(signals.some((s) => s.startsWith('Compliance:'))).toBe(true);
    // No positive classification leaks in, and no signal contains a raw threshold number.
    expect(signals.some((s) => /Meets|Excellent|Fully Compliant|Clear/.test(s))).toBe(false);
    expect(signals.some((s) => /\d/.test(s))).toBe(false);
  });
});

describe('buildEmployeeProfileCard', () => {
  it('builds a contract-valid high-risk profile card from real data', () => {
    const profile = highRiskSnapshot();
    const card = buildEmployeeProfileCard(profile, evaluateNormRules(profile));
    expect(() => CardPayloadSchema.parse(card)).not.toThrow();
    expect(card.type).toBe('employee_profile_report');
    expect(card.employee.memberId).toBe('EMP-031');
    expect(card.riskBadge).toBe('high');
    expect(card.account).toBe('Account B');
    expect(card.reviewPeriod).toBe('April 2026');
    expect(card.kpi).toEqual({ score: 2.2, target: 3.0, unit: 'pt' });
    expect(card.openViolations).toBe(1);
    expect(card.allocationPct).toBe(110);
    expect(card.normResult).toBe('At Risk');
    expect(card.riskSignals.length).toBeGreaterThan(0);
  });
});

describe('buildInlineTranscriptCard', () => {
  it('builds a compact card with a danger KPI metric and a review note', () => {
    const profile = highRiskSnapshot();
    const card = buildInlineTranscriptCard(profile, evaluateNormRules(profile));
    expect(() => CardPayloadSchema.parse(card)).not.toThrow();
    expect(card.intro).toContain('EMP-031');
    expect(card.intro).toContain('Nguyễn Thị Lan');
    const kpi = card.metrics.find((m) => m.label === 'KPI');
    expect(kpi?.emphasis).toBe('danger');
    expect(card.footerBadge?.tone).toBe('high');
    expect(card.footerNote).toBe('Flagged for review');
  });
});

describe('buildAtRiskListCard', () => {
  const entries: AtRiskEntry[] = [
    {
      memberId: 'EMP-031',
      name: 'Nguyễn Thị Lan',
      risk: 'high',
      summary: 'KPI below target',
      recommendedAction: 'Schedule 1:1',
    },
  ];

  it('shows names for a leader', () => {
    const card = buildAtRiskListCard(
      entries,
      { accountLabel: 'Account B', period: '2026-04' },
      'leader',
    );
    expect(() => CardPayloadSchema.parse(card)).not.toThrow();
    expect(card.title).toBe('At-risk employees — Account B, April 2026');
    expect(card.employees[0]?.name).toBe('Nguyễn Thị Lan');
  });

  it('redacts individual names for the BOD aggregate view', () => {
    const card = buildAtRiskListCard(entries, {}, 'bod');
    expect(card.employees[0]?.name).toBe('EMP-031');
  });
});

describe('buildAccountSummaryCard', () => {
  it('computes the high-risk percentage from the population', () => {
    const card = buildAccountSummaryCard({
      scopeLabel: 'All accounts',
      accountId: null,
      period: null,
      high: 8,
      medium: 22,
      low: 94,
      total: 124,
      narrative: 'Overall talent risk is moderate.',
    });
    expect(() => CardPayloadSchema.parse(card)).not.toThrow();
    expect(card.counts).toEqual({ high: 8, medium: 22, low: 94 });
    expect(card.totalEmployees).toBe(124);
    expect(card.highPct).toBe(6);
  });
});

describe('buildAccessDeniedCard / buildHumanReviewFlagCard', () => {
  it('builds a contract-valid access-denied card', () => {
    const card = buildAccessDeniedCard({
      message: 'no access',
      currentRole: audienceRoleLabel('leader'),
      requiredRole: 'HR role required',
    });
    expect(() => CardPayloadSchema.parse(card)).not.toThrow();
    expect(card.currentRole).toBe('Leader role');
  });

  it('builds a contract-valid human-review card carrying the conclusion', () => {
    const card = buildHumanReviewFlagCard({ conclusion: 'EMP-031 flagged for PIP consideration.' });
    expect(() => CardPayloadSchema.parse(card)).not.toThrow();
    expect(card.conclusion).toContain('EMP-031');
    expect(card.badge).toBe('SENSITIVE');
  });
});
