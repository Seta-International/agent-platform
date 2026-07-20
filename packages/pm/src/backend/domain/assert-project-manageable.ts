import type { SessionScope } from '@seta/core';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq, isNull, type SQL } from 'drizzle-orm';
import { pmDb } from '../db/client.ts';
import { project } from '../db/schema.ts';
import { PmError, requirePermission } from '../rbac.ts';
import { buildProjectManageScope, buildProjectScope } from './scope.ts';

/**
 * Row-scope gate for project mutations (FUT-353: allocations; also weekly reports). The
 * permission gate proves the caller holds `pm.project.manage` somewhere; the row scope then
 * asserts it covers THIS project. Readable-but-unmanaged projects reject FORBIDDEN (the RA
 * Monitoring row is read-only); invisible projects reject NOT_FOUND so existence never leaks
 * through the mutation path.
 */
export async function assertProjectManageable(
  project_id: string,
  session: SessionScope,
): Promise<void> {
  requirePermission(session, 'pm.project.manage');
  const manageScope = buildProjectManageScope(session);
  if (!manageScope) return; // tenant-wide manage

  const matches = async (scope: SQL | null): Promise<boolean> => {
    const conds = [
      eq(project.id, project_id),
      tenantScoped(project.tenant_id, session),
      isNull(project.deleted_at),
    ];
    if (scope) conds.push(scope);
    const [row] = await pmDb()
      .select({ id: project.id })
      .from(project)
      .where(and(...conds))
      .limit(1);
    return row !== undefined;
  };

  if (await matches(manageScope)) return;
  if (await matches(buildProjectScope(session))) {
    throw new PmError('FORBIDDEN', 'you do not manage this project');
  }
  throw new PmError('NOT_FOUND', `project ${project_id} not found`);
}
