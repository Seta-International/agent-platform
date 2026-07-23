import { describe, expect, it } from 'vitest';
import {
  dashboardCopy,
  formatPerformanceMonth,
  resolveDashboardId,
} from '../../src/nav/performance-dashboard.ts';

describe('resolveDashboardId (AC1 / TC-18)', () => {
  it('routes AM / TL / Member from capacity kind', () => {
    expect(resolveDashboardId([], { kind: 'am', account_id: 'a', label: 'Acme' })).toBe('am');
    expect(
      resolveDashboardId([], {
        kind: 'tl',
        project_id: 'p',
        account_id: 'a',
        label: 'Atlas',
      }),
    ).toBe('tl');
    expect(
      resolveDashboardId([], {
        kind: 'member',
        project_id: 'p',
        account_id: 'a',
        label: 'Atlas',
      }),
    ).toBe('member');
  });

  it('routes HR and PMO/BoD in organization mode', () => {
    expect(resolveDashboardId(['people.manager'], null)).toBe('hr');
    expect(resolveDashboardId(['pm.pmo'], null)).toBe('strategic');
    expect(resolveDashboardId(['pm.bod'], null)).toBe('strategic');
  });

  it('capacity kind wins over strategic role slugs', () => {
    expect(
      resolveDashboardId(['pm.pmo'], {
        kind: 'member',
        project_id: 'p',
        account_id: 'a',
        label: 'X',
      }),
    ).toBe('member');
  });
});

describe('dashboardCopy + formatPerformanceMonth', () => {
  it('returns role-specific copy', () => {
    expect(dashboardCopy('tl').title).toBe('Performance reviews');
    expect(dashboardCopy('member').subtitle).toMatch(/self-assessment/i);
  });

  it('formats YYYY-MM', () => {
    expect(formatPerformanceMonth('2026-04')).toBe('Apr 2026');
  });
});
