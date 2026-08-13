import type { PerformanceCapacity } from '../api/people-client.ts';

export type PerformanceDashboardId = 'member' | 'tl' | 'am' | 'strategic' | 'hr' | 'none';

const HR_ROLES = new Set(['people.manager']);

/**
 * FE-AD-13 role → dashboard map for SCR-02 home (FUT-695 / AC1).
 * Capacity kind wins when present; org mode is gated by `people.performance.read_org`
 * (surfaced as `canViewOrg`). A capacity-less user WITHOUT that permission gets `none`
 * — never the org view, which would leak company-wide data (FUT-781).
 */
export function resolveDashboardId(
  roleSlugs: readonly string[],
  capacity: PerformanceCapacity | null,
  canViewOrg: boolean,
): PerformanceDashboardId {
  if (capacity?.kind === 'am') return 'am';
  if (capacity?.kind === 'tl') return 'tl';
  if (capacity?.kind === 'member') return 'member';

  if (roleSlugs.some((r) => HR_ROLES.has(r))) return 'hr';
  if (canViewOrg) return 'strategic';
  return 'none';
}

export type DashboardCopy = {
  title: string;
  subtitle: string;
};

export function dashboardCopy(id: PerformanceDashboardId): DashboardCopy {
  switch (id) {
    case 'member':
      return {
        title: 'Performance reviews',
        subtitle: 'Your monthly review, self-assessment and per-project scores.',
      };
    case 'tl':
      return {
        title: 'Performance reviews',
        subtitle:
          'Evaluate each member of your project team — project pillars roll up from your evaluations.',
      };
    case 'am':
      return {
        title: 'Performance reviews',
        subtitle:
          'Evaluate Team Leads on your account — account health rolls up from the same 5-pillar model.',
      };
    case 'strategic':
      return {
        title: 'Performance reviews',
        subtitle:
          'BoD / PMO tier — evaluate Account Managers and department heads; account health rolls up from the 5-pillar model.',
      };
    case 'hr':
      return {
        title: 'Performance reviews',
        subtitle:
          'HR view — cycle configuration and org-wide performance readiness for this month.',
      };
    case 'none':
      return {
        title: 'Performance reviews',
        subtitle: 'No performance context is available for your account this month.',
      };
  }
}

/** Human-readable cycle month echo (UTC calendar parts of YYYY-MM). */
export function formatPerformanceMonth(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  const year = Number(m[1]);
  const month = Number(m[2]);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
