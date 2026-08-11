import type { SessionScope } from '@seta/core';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq, isNull } from 'drizzle-orm';
import { pmDb } from '../db/client.ts';
import { project } from '../db/schema.ts';
import { PmError } from '../rbac.ts';
import { assertProjectManageable } from './assert-project-manageable.ts';
import { buildProjectReporterFlag } from './scope.ts';

export async function assertProjectReportable(
  project_id: string,
  session: SessionScope,
): Promise<void> {
  await assertProjectManageable(project_id, session);

  const [row] = await pmDb()
    .select({ can_report: buildProjectReporterFlag(session) })
    .from(project)
    .where(
      and(
        eq(project.id, project_id),
        tenantScoped(project.tenant_id, session),
        isNull(project.deleted_at),
      ),
    )
    .limit(1);
  if (!row) throw new PmError('NOT_FOUND', `project ${project_id} not found`);
  if (!row.can_report) {
    throw new PmError('FORBIDDEN', "only this project's EM and PMO can write its weekly report");
  }
}
