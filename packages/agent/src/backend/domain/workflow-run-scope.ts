import {
  getDefaultRegistry,
  IMPLICIT_PERMISSIONS,
  type PermissionScope,
  resolveScope,
} from '@seta/shared-rbac';
import type { SessionLike } from '../types.ts';

export type WorkflowRunScope = 'self' | 'group' | 'tenant' | 'instance';

/** Resolves the caller's row-visibility scope for an `agent.workflow.run.*`
 *  permission from their role assignments. `self` scope is always at least
 *  available — it's IMPLICIT for every authenticated session. */
export function resolveRunPermissionScope(
  session: SessionLike,
  permission: string,
): PermissionScope {
  return resolveScope(
    getDefaultRegistry(),
    session.role_summary.assignments ?? [],
    IMPLICIT_PERMISSIONS,
    permission,
  );
}

/** Maps a client-requested view (self/group/tenant/instance) onto the
 *  resolved scope decision. `instance` is the old cross-tenant escape hatch:
 *  tenant-wide scope plus the session's cross_tenant_read flag. */
export function canRequestRunScope(
  decision: PermissionScope,
  requested: WorkflowRunScope,
  crossTenantRead: boolean,
): boolean {
  if (requested === 'instance') return decision.kind === 'tenant' && crossTenantRead;
  if (requested === 'self') {
    return decision.kind === 'tenant' || (decision.kind === 'subset' && decision.self);
  }
  return decision.kind === 'tenant'; // 'group' | 'tenant'
}
