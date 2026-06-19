import { type Statement, toManifest } from '@seta/shared-rbac';

export const performanceStatement = {
  'performance.dashboard': ['read', 'team.read', 'executive.read'],
} as const satisfies Statement;

const roleStatements = {
  'performance.employee': { 'performance.dashboard': ['read'] },
  'performance.manager': { 'performance.dashboard': ['read', 'team.read'] },
  'performance.bod': { 'performance.dashboard': ['read', 'team.read', 'executive.read'] },
} as const satisfies Record<string, Statement>;

export const performanceRbac = toManifest('performance', performanceStatement, roleStatements, {
  'performance.employee': 'View own performance dashboard',
  'performance.manager': 'View own and team performance dashboards',
  'performance.bod': 'View all performance dashboards including executive view',
});

export type PerformancePermission = (typeof performanceRbac.permissions)[number]['key'];
