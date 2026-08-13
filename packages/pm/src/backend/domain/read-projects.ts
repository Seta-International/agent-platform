import type { SessionScope } from '@seta/core';
import { tenantScoped } from '@seta/shared-rbac';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { pmDb } from '../db/client.ts';
import { LIVE_PROJECT_STATUSES, project } from '../db/schema.ts';
import { PmError, requirePermission } from '../rbac.ts';
import { buildProjectManageFlag, buildProjectReporterFlag, buildProjectScope } from './scope.ts';

export interface ProjectListRow {
  project_id: string;
  account_id: string;
  name: string;
  phase: string;
  status: string;
  pm_worker_id: string | null;
  org_unit_id: string | null;
  // Whether the requesting session may manage this project — drives the RA Monitoring
  // "Add allocation" project picker and Add button (FUT-353). Read scope is wider than manage.
  can_manage: boolean;
  can_report: boolean;
}

export async function listProjects(session: SessionScope): Promise<ProjectListRow[]> {
  requirePermission(session, 'pm.project.read');
  const conds = [
    tenantScoped(project.tenant_id, session),
    isNull(project.deleted_at),
    inArray(project.status, LIVE_PROJECT_STATUSES),
  ];
  const scope = buildProjectScope(session);
  if (scope) conds.push(scope);
  const rows = await pmDb()
    .select({
      project_id: project.id,
      account_id: project.account_id,
      name: project.name,
      phase: project.phase,
      status: project.status,
      pm_worker_id: project.pm_person_id,
      org_unit_id: project.org_unit_id,
      can_manage: buildProjectManageFlag(session),
      can_report: buildProjectReporterFlag(session),
    })
    .from(project)
    .where(and(...conds))
    .orderBy(desc(project.created_at));
  return rows;
}

export async function getProject(input: { project_id: string; session: SessionScope }) {
  const { project_id, session } = input;
  requirePermission(session, 'pm.project.read');
  const conds = [
    eq(project.id, project_id),
    tenantScoped(project.tenant_id, session),
    isNull(project.deleted_at),
    inArray(project.status, LIVE_PROJECT_STATUSES),
  ];
  const scope = buildProjectScope(session);
  if (scope) conds.push(scope);
  const [p] = await pmDb()
    .select({ project: project, can_manage: buildProjectManageFlag(session) })
    .from(project)
    .where(and(...conds))
    .limit(1);
  // Invisible-through-scope rows return NOT_FOUND, never FORBIDDEN — don't leak existence.
  if (!p) throw new PmError('NOT_FOUND', 'project not found');
  const proj = p.project;
  return {
    can_manage: p.can_manage,
    project_id: proj.id,
    account_id: proj.account_id,
    name: proj.name,
    objective: proj.objective,
    scope: proj.scope as { in: string; out: string } | null,
    budget_bmm: proj.budget_bmm,
    pm_worker_id: proj.pm_person_id,
    pmo_worker_id: proj.pmo_person_id,
    team_size: proj.team_size,
    methodology: proj.methodology,
    pricing_model: proj.pricing_model,
    date_from: proj.date_from,
    date_to: proj.date_to,
    phase: proj.phase,
    status: proj.status,
    planner_group_id: proj.planner_group_id,
    org_unit_id: proj.org_unit_id,
    version: proj.version,
  };
}
