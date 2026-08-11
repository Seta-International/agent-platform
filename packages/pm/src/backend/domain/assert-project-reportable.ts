import type { SessionScope } from '@seta/core';
import { can, tenantScoped } from '@seta/shared-rbac';
import { and, eq, isNull } from 'drizzle-orm';
import { pmDb } from '../db/client.ts';
import { project } from '../db/schema.ts';
import { PmError } from '../rbac.ts';
import { assertProjectManageable } from './assert-project-manageable.ts';

export function isProjectReporter(
  session: SessionScope,
  row: { pm_person_id: string | null; pmo_person_id: string | null },
): boolean {
  if (session.person_id === null) return false;
  if (!can(session, 'pm.project.manage')) return false;
  return row.pm_person_id === session.person_id || row.pmo_person_id === session.person_id;
}

export async function assertProjectReportable(
  project_id: string,
  session: SessionScope,
): Promise<void> {
  await assertProjectManageable(project_id, session);

  const [row] = await pmDb()
    .select({ pm_person_id: project.pm_person_id, pmo_person_id: project.pmo_person_id })
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
  if (!isProjectReporter(session, row)) {
    throw new PmError('FORBIDDEN', "only this project's EM and PMO can write its weekly report");
  }
}
