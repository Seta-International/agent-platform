import type { SessionScope } from '@seta/core';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq, gt, inArray, isNull, lt, or } from 'drizzle-orm';
import { pmDb } from '../db/client.ts';
import { projectAccess, reporterAssignment } from '../db/schema.ts';
import { requirePermission } from '../rbac.ts';
import { isoWeekRange } from './iso-week.ts';

export interface ReporterAsOf {
  project_id: string;
  person_id: string;
}

/**
 * Project-assignment read port (FUT-610): the Reporter→Project owner mapping in force during
 * a given ISO week — who was accountable THEN, not who is accountable now. Backed by the
 * reporter_assignment temporal projection (kept current by pm.project.access.changed); a
 * project the projection has never seen (created before the projection existed on an
 * environment where the migration backfill could not read through RLS) falls back to the
 * live project_access owners, which matches the pre-FUT-610 behaviour for those projects.
 */
export async function getReportersAsOf(input: {
  project_ids: string[];
  iso_year: number;
  iso_week: number;
  session: SessionScope;
}): Promise<ReporterAsOf[]> {
  const { project_ids, iso_year, iso_week, session } = input;
  requirePermission(session, 'pm.project.read');
  if (project_ids.length === 0) return [];

  const week = isoWeekRange(iso_year, iso_week);
  const weekStart = new Date(`${week.from}T00:00:00Z`);
  const weekEndExclusive = new Date(new Date(`${week.to}T00:00:00Z`).getTime() + 86_400_000);

  // In force at any point during the week: opened before the week ended and not closed
  // before it started.
  const rows = await pmDb()
    .select({
      project_id: reporterAssignment.project_id,
      person_id: reporterAssignment.person_id,
    })
    .from(reporterAssignment)
    .where(
      and(
        tenantScoped(reporterAssignment.tenant_id, session),
        inArray(reporterAssignment.project_id, project_ids),
        lt(reporterAssignment.valid_from, weekEndExclusive),
        or(isNull(reporterAssignment.valid_to), gt(reporterAssignment.valid_to, weekStart)),
      ),
    );

  // Fallback for projects the projection has never seen (no rows at ANY time, not just none
  // in this window — a window miss on a known project is a real "nobody owned it that week").
  const seen = await pmDb()
    .selectDistinct({ project_id: reporterAssignment.project_id })
    .from(reporterAssignment)
    .where(
      and(
        tenantScoped(reporterAssignment.tenant_id, session),
        inArray(reporterAssignment.project_id, project_ids),
      ),
    );
  const seenIds = new Set(seen.map((r) => r.project_id));
  const unseen = project_ids.filter((id) => !seenIds.has(id));
  if (unseen.length === 0) return rows;

  const live = await pmDb()
    .select({ project_id: projectAccess.project_id, person_id: projectAccess.person_id })
    .from(projectAccess)
    .where(
      and(
        tenantScoped(projectAccess.tenant_id, session),
        inArray(projectAccess.project_id, unseen),
        eq(projectAccess.level, 'owner'),
      ),
    );
  return [...rows, ...live];
}
