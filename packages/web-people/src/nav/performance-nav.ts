import type { PerformanceCapacity } from '../api/people-client.ts';

/**
 * Top-level Performance destinations (no secondary sidebar).
 * AM gets Reviews + Configuration via SegmentedControl; other roles have a single workspace.
 */
export type PerformanceNavId = 'reviews' | 'configuration' | 'cycle';

export type PerformanceTopTab = {
  id: PerformanceNavId;
  label: string;
  to: '/people/performance' | '/people/performance/configuration' | '/people/performance/cycle';
};

const REVIEWS_TAB: PerformanceTopTab = {
  id: 'reviews',
  label: 'Reviews',
  to: '/people/performance',
};
const CONFIGURATION_TAB: PerformanceTopTab = {
  id: 'configuration',
  label: 'Configuration',
  to: '/people/performance/configuration',
};
/**
 * PMO manual unlock — its own workspace, and only in the organization view. It is a
 * company-wide control, so it has no place beside the personal scorecard someone sees
 * while acting as an AM, TL or member, even when they hold the permission.
 */
const CYCLE_TAB: PerformanceTopTab = {
  id: 'cycle',
  label: 'Cycle unlock',
  to: '/people/performance/cycle',
};

/**
 * Top tabs for the current capacity and permissions. A single tab is no tabs: the
 * SegmentedControl only earns its place once there is somewhere else to go.
 */
export function performanceTopTabs({
  capacity,
  canUnlock,
}: {
  capacity: PerformanceCapacity | null;
  canUnlock: boolean;
}): readonly PerformanceTopTab[] {
  const tabs: PerformanceTopTab[] = [REVIEWS_TAB];
  if (capacity?.kind === 'am') tabs.push(CONFIGURATION_TAB);
  if (canUnlock && capacity === null) tabs.push(CYCLE_TAB);
  return tabs.length > 1 ? tabs : [];
}

/**
 * Whether the current path is allowed for this capacity / role set.
 * Deep links to legacy stubs (scoring, morale, …) stay reachable only when they match the role.
 * Cycle unlock is gated on the permission rather than a role list, since the server
 * checks `people.performance.unlock` and nothing else on every unlock call — plus the
 * organization view, so switching into a delivery capacity falls back to Reviews.
 */
export function isPerformancePathAllowed({
  pathname,
  roleSlugs,
  capacity,
  canUnlock,
}: {
  pathname: string;
  roleSlugs: readonly string[];
  capacity: PerformanceCapacity | null;
  canUnlock: boolean;
}): boolean {
  const path = pathname.replace(/\/$/, '') || '/';
  const kind = capacity?.kind;
  const strategic = roleSlugs.some(
    (r) => r === 'pm.pmo' || r === 'pm.bod' || r === 'people.manager',
  );

  if (path === '/people/performance') return true;
  if (path === '/people/performance/configuration') return kind === 'am';
  if (path === '/people/performance/scoring') return kind === 'tl' || kind === 'am';
  if (path === '/people/performance/self-assessment') return kind === 'member';
  if (path === '/people/performance/morale')
    return kind === 'member' || kind === 'tl' || kind === 'am';
  if (path === '/people/performance/history') return true;
  if (path === '/people/performance/cycle') return canUnlock && capacity === null;
  if (path === '/people/performance/audit') return strategic;
  return false;
}
