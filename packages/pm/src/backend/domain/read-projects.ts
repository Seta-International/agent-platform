import type { SessionScope } from '@seta/core';
import { tenantScoped } from '@seta/shared-rbac';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { pmDb } from '../db/client.ts';
import { project } from '../db/schema.ts';
import { PmError, requirePermission } from '../rbac.ts';
import { buildProjectScope } from './scope.ts';

export interface ProjectListRow {
  project_id: string;
  account_id: string;
  name: string;
  phase: string;
  status: string;
  pm_worker_id: string | null;
  org_unit_id: string | null;
}

export async function listProjects(session: SessionScope): Promise<ProjectListRow[]> {
  requirePermission(session, 'pm.project.read');
  const conds = [tenantScoped(project.tenant_id, session), isNull(project.deleted_at)];
  const scope = buildProjectScope(session);
  if (scope) conds.push(scope);
  const rows = await pmDb()
    .select({
      project_id: project.id,
      account_id: project.account_id,
      name: project.name,
      phase: project.phase,
      status: project.status,
      pm_worker_id: project.pm_worker_id,
      org_unit_id: project.org_unit_id,
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
  ];
  const scope = buildProjectScope(session);
  if (scope) conds.push(scope);
  const [p] = await pmDb()
    .select()
    .from(project)
    .where(and(...conds))
    .limit(1);
  // Invisible-through-scope rows return NOT_FOUND, never FORBIDDEN — don't leak existence.
  if (!p) throw new PmError('NOT_FOUND', 'project not found');
  return {
    project_id: p.id,
    account_id: p.account_id,
    charter_id: p.charter_id,
    name: p.name,
    objective: p.objective,
    scope: p.scope as { in: string; out: string } | null,
    budget_bmm: p.budget_bmm,
    pm_worker_id: p.pm_worker_id,
    pmo_worker_id: p.pmo_worker_id,
    team_size: p.team_size,
    methodology: p.methodology,
    pricing_model: p.pricing_model,
    date_from: p.date_from,
    date_to: p.date_to,
    phase: p.phase,
    status: p.status,
    planner_group_id: p.planner_group_id,
    org_unit_id: p.org_unit_id,
    version: p.version,
  };
}
