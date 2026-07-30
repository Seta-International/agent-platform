import type { PerformanceCapacity } from '../api/people-client.ts';

export type PerformanceNavId =
  | 'dashboard'
  | 'scoring'
  | 'self-assessment'
  | 'morale'
  | 'history'
  | 'configuration'
  | 'audit'
  | 'cycle';

export type PerformanceNavItem = {
  id: PerformanceNavId;
  label: string;
  /** Path under /people/performance */
  to: string;
};

export const PERFORMANCE_NAV: readonly PerformanceNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', to: '/people/performance' },
  { id: 'scoring', label: 'Scoring', to: '/people/performance/scoring' },
  { id: 'self-assessment', label: 'Self-assessment', to: '/people/performance/self-assessment' },
  { id: 'morale', label: 'Morale', to: '/people/performance/morale' },
  { id: 'history', label: 'History', to: '/people/performance/history' },
  { id: 'configuration', label: 'Configuration', to: '/people/performance/configuration' },
  { id: 'audit', label: 'Audit', to: '/people/performance/audit' },
  { id: 'cycle', label: 'Cycle', to: '/people/performance/cycle' },
] as const;

const STRATEGIC_ROLES = new Set(['pm.pmo', 'pm.bod', 'people.manager']);
const HR_ROLES = new Set(['people.manager']);

function hasAnyRole(roleSlugs: readonly string[], allowed: ReadonlySet<string>): boolean {
  return roleSlugs.some((r) => allowed.has(r));
}

/**
 * Affordance filter for the Performance secondary sidebar (FE-AD-6).
 * Hidden items are omitted — never disabled. Real authz remains on the server.
 */
export function filterPerformanceNav(
  roleSlugs: readonly string[],
  capacity: PerformanceCapacity | null,
): PerformanceNavItem[] {
  const kind = capacity?.kind;
  return PERFORMANCE_NAV.filter((item) => {
    switch (item.id) {
      case 'dashboard':
      case 'history':
        return true;
      case 'scoring':
        return kind === 'tl' || kind === 'am';
      case 'self-assessment':
        return kind === 'member';
      case 'morale':
        return kind === 'member' || kind === 'tl' || kind === 'am';
      case 'configuration':
        return hasAnyRole(roleSlugs, HR_ROLES);
      case 'audit':
      case 'cycle':
        return hasAnyRole(roleSlugs, STRATEGIC_ROLES);
      default:
        return false;
    }
  });
}

/** Whether a nav section path is allowed under the current affordance (for beforeLoad). */
export function isPerformanceNavAllowed(
  navId: PerformanceNavId,
  roleSlugs: readonly string[],
  capacity: PerformanceCapacity | null,
): boolean {
  return filterPerformanceNav(roleSlugs, capacity).some((i) => i.id === navId);
}
