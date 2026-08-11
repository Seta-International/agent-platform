import type { PerformanceNavId } from './performance-nav.ts';

/** Map a Performance pathname to its top-tab id (for SegmentedControl). */
export function navIdFromPath(pathname: string): PerformanceNavId | null {
  const path = pathname.replace(/\/$/, '') || '/';
  if (path === '/people/performance') return 'reviews';
  if (path === '/people/performance/configuration') return 'configuration';
  return null;
}
