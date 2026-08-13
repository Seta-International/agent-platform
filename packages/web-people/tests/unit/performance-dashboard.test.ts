import { describe, expect, it } from 'vitest';
import {
  dashboardCopy,
  formatPerformanceMonth,
  resolveDashboardId,
} from '../../src/nav/performance-dashboard.ts';

describe('resolveDashboardId (AC1 / TC-18)', () => {
  it('routes AM / TL / Member from capacity kind', () => {
    expect(resolveDashboardId([], { kind: 'am', account_id: 'a', label: 'Acme' }, false)).toBe(
      'am',
    );
    expect(
      resolveDashboardId(
        [],
        { kind: 'tl', project_id: 'p', account_id: 'a', label: 'Atlas' },
        false,
      ),
    ).toBe('tl');
    expect(
      resolveDashboardId(
        [],
        { kind: 'member', project_id: 'p', account_id: 'a', label: 'Atlas' },
        false,
      ),
    ).toBe('member');
  });

  it('routes HR and org-viewers (PMO/BoD) in organization mode', () => {
    expect(resolveDashboardId(['people.manager'], null, true)).toBe('hr');
    expect(resolveDashboardId(['pm.pmo'], null, true)).toBe('strategic');
    expect(resolveDashboardId(['pm.bod'], null, true)).toBe('strategic');
  });

  it('capacity-less without org access gets no dashboard — never a company-data leak (FUT-781)', () => {
    // The old blanket "capacity-less ⇒ strategic" fallback would have leaked the org view.
    expect(resolveDashboardId([], null, false)).toBe('none');
    expect(resolveDashboardId(['pm.viewer'], null, false)).toBe('none');
  });

  it('capacity kind wins over strategic role slugs', () => {
    expect(
      resolveDashboardId(
        ['pm.pmo'],
        { kind: 'member', project_id: 'p', account_id: 'a', label: 'X' },
        true,
      ),
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
