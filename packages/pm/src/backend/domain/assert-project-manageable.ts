import type { SessionScope } from '@seta/core';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq, isNull, type SQL } from 'drizzle-orm';
import { pmDb } from '../db/client.ts';
import { project } from '../db/schema.ts';
import { PmError } from '../rbac.ts';
import { buildProjectManageScope, buildProjectScope } from './scope.ts';

/**
 * Row-scope gate for allocation mutations (FUT-353). `requirePermission('pm.project.manage')`
 * only proves the caller holds the permission somewhere; this asserts it covers THIS project.
 * Readable-but-unmanaged projects reject FORBIDDEN (the RA Monitoring row is read-only);
 * invisible projects reject NOT_FOUND so existence never leaks through the mutation path.
 */
export async function assertProjectManageable(
  project_id: string,
  session: SessionScope,
): Promise<void> {
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
