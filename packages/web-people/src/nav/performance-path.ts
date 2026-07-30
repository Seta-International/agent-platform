import type { PerformanceNavId } from './performance-nav.ts';

/** Map a Performance pathname to its nav id (for affordance guards). */
export function navIdFromPath(pathname: string): PerformanceNavId | null {
  const path = pathname.replace(/\/$/, '') || '/';
  if (path === '/people/performance') return 'dashboard';
  const rest = path.slice('/people/performance/'.length);
  switch (rest) {
    case 'scoring':
      return 'scoring';
    case 'self-assessment':
      return 'self-assessment';
    case 'morale':
      return 'morale';
    case 'history':
      return 'history';
    case 'configuration':
      return 'configuration';
    case 'audit':
      return 'audit';
    case 'cycle':
      return 'cycle';
    default:
      return null;
  }
}
