import type { PerformanceCapacity } from '../api/people-client.ts';

/**
 * Top-level Performance destinations (no secondary sidebar).
 * AM gets Reviews + Configuration via SegmentedControl; other roles have a single workspace.
 */
export type PerformanceNavId = 'reviews' | 'configuration';

export type PerformanceTopTab = {
  id: PerformanceNavId;
  label: string;
  to: '/people/performance' | '/people/performance/configuration';
};

/** AM-only top tabs. */
export const AM_TOP_TABS: readonly PerformanceTopTab[] = [
  { id: 'reviews', label: 'Reviews', to: '/people/performance' },
  { id: 'configuration', label: 'Configuration', to: '/people/performance/configuration' },
] as const;

export function amTopTabs(capacity: PerformanceCapacity | null): readonly PerformanceTopTab[] {
  return capacity?.kind === 'am' ? AM_TOP_TABS : [];
}

/**
 * Whether the current path is allowed for this capacity / role set.
 * Deep links to legacy stubs (scoring, self-assessment, …) stay reachable only when they match the role.
 */
export function isPerformancePathAllowed(
  pathname: string,
  roleSlugs: readonly string[],
  capacity: PerformanceCapacity | null,
): boolean {
  const path = pathname.replace(/\/$/, '') || '/';
  const kind = capacity?.kind;
  const strategic = roleSlugs.some(
    (r) => r === 'pm.pmo' || r === 'pm.bod' || r === 'people.manager',
  );

  if (path === '/people/performance') return true;
  if (path === '/people/performance/configuration') return kind === 'am';
  if (path === '/people/performance/scoring') return kind === 'tl' || kind === 'am';
  if (path === '/people/performance/self-assessment') return kind === 'member';
  if (path === '/people/performance/history') return true;
  if (path === '/people/performance/audit' || path === '/people/performance/cycle')
    return strategic;
  return false;
}

/** @deprecated Use isPerformancePathAllowed — kept for call sites during rename. */
export function isPerformanceNavAllowed(
  navId: string,
  roleSlugs: readonly string[],
  capacity: PerformanceCapacity | null,
): boolean {
  const path =
    navId === 'reviews' || navId === 'dashboard'
      ? '/people/performance'
      : `/people/performance/${navId === 'configuration' ? 'configuration' : navId}`;
  return isPerformancePathAllowed(path, roleSlugs, capacity);
}

/** @deprecated Sidebar filter removed — AM tabs via amTopTabs. */
export function filterPerformanceNav(
  _roleSlugs: readonly string[],
  capacity: PerformanceCapacity | null,
): PerformanceTopTab[] {
  return [...amTopTabs(capacity)];
}
