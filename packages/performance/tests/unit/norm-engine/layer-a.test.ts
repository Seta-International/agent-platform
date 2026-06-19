import { describe, expect, it } from 'vitest';
import {
  evaluateLayerA,
  evaluateNormRules,
} from '../../../src/backend/domain/norm-engine/index.ts';
import type { ProfileSnapshot } from '../../../src/backend/domain/schemas.ts';

function snapshot(overrides: Partial<ProfileSnapshot> = {}): ProfileSnapshot {
  return {
    employee: null,
    performance: [
      {
        period: '2026-04',
        kpiScore: 3.5,
        classification: 'Meets',
        feedbackCategories: [],
        trend: 'flat',
      },
    ],
    timesheet: [
      { period: '2026-04', otHours: 10, attendancePct: 97, complianceFlag: true, logWorkPct: 98 },
    ],
    violations: { riskFlag: false, openCount: 0, criticalCount: 0, history: [] },
    allocation: {
      accountId: 'A',
      projectId: 'P',
      allocationPct: 100,
      status: 'active',
      overloadFlag: false,
      benchFlag: false,
    },
    missingDatasets: [],
    ...overrides,
  };
}

function triggeredIds(profile: ProfileSnapshot): string[] {
  return evaluateLayerA(profile)
    .filter((r) => r.triggered)
    .map((r) => r.ruleId);
}

describe('NORM Layer A — KPI classification (boundary values)', () => {
  const cases: Array<[number, string]> = [
    [4.5, 'NORM-K01'],
    [4.49, 'NORM-K02'],
    [4.0, 'NORM-K02'],
    [3.99, 'NORM-K03'],
    [3.0, 'NORM-K03'],
    [2.99, 'NORM-K04'],
    [2.5, 'NORM-K04'],
    [2.49, 'NORM-K05'],
    [2.2, 'NORM-K05'],
  ];
  it.each(cases)('score %s → %s, and exactly one KPI rule fires', (score, expectedRule) => {
    const profile = snapshot({
      performance: [
        {
          period: '2026-04',
          kpiScore: score,
          classification: 'x',
          feedbackCategories: [],
          trend: null,
        },
      ],
    });
    const kpiTriggered = evaluateLayerA(profile).filter((r) => r.category === 'kpi' && r.triggered);
    expect(kpiTriggered).toHaveLength(1);
    expect(kpiTriggered[0]?.ruleId).toBe(expectedRule);
  });
});

describe('NORM Layer A — always evaluates 21 rules when all datasets present', () => {
  it('returns 21 results regardless of which fire', () => {
    expect(evaluateLayerA(snapshot())).toHaveLength(21);
  });
});

describe('NORM Layer A — other categories', () => {
  it('flags overload when allocation > 120%', () => {
    expect(
      triggeredIds(
        snapshot({
          allocation: {
            accountId: 'A',
            projectId: 'P',
            allocationPct: 130,
            status: 'active',
            overloadFlag: true,
            benchFlag: false,
          },
        }),
      ),
    ).toContain('NORM-A01');
  });

  it('flags high violation risk on a critical case', () => {
    expect(
      triggeredIds(
        snapshot({
          violations: { riskFlag: true, openCount: 2, criticalCount: 1, history: [] },
        }),
      ),
    ).toContain('NORM-V01');
  });

  it('flags low attendance below 90%', () => {
    expect(
      triggeredIds(
        snapshot({
          timesheet: [
            {
              period: '2026-04',
              otHours: 10,
              attendancePct: 85,
              complianceFlag: true,
              logWorkPct: 98,
            },
          ],
        }),
      ),
    ).toContain('NORM-AT01');
  });
});

describe('NORM composite baseline', () => {
  it('returns "critical" for At Risk + Overloaded', () => {
    const result = evaluateNormRules(
      snapshot({
        performance: [
          {
            period: '2026-04',
            kpiScore: 2.0,
            classification: 'At Risk',
            feedbackCategories: [],
            trend: 'down',
          },
        ],
        allocation: {
          accountId: 'A',
          projectId: 'P',
          allocationPct: 130,
          status: 'active',
          overloadFlag: true,
          benchFlag: false,
        },
      }),
    );
    expect(result.compositeRiskBaseline).toBe('critical');
  });

  it('returns "none" for a clean, meets-expectations profile', () => {
    expect(evaluateNormRules(snapshot()).compositeRiskBaseline).toBe('none');
  });

  it('classifiedFacts never leak raw scores (classifications only)', () => {
    const result = evaluateNormRules(
      snapshot({
        performance: [
          {
            period: '2026-04',
            kpiScore: 2.2,
            classification: 'At Risk',
            feedbackCategories: [],
            trend: 'down',
          },
        ],
      }),
    );
    expect(result.classifiedFacts.some((f) => f.includes('At Risk'))).toBe(true);
    expect(result.classifiedFacts.some((f) => f.includes('2.2'))).toBe(false);
  });
});
