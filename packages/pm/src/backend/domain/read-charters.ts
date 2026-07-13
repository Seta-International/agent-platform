import type { SessionScope } from '@seta/core';
import { tenantScoped } from '@seta/shared-rbac';
import { and, asc, count, desc, eq, ilike, inArray } from 'drizzle-orm';
import { type CharterListQueryInput, charterListQuery } from '../../contracts.ts';
import { pmDb } from '../db/client.ts';
import { project, projectApproval } from '../db/schema.ts';
import { PmError, requirePermission } from '../rbac.ts';

export interface CharterListRow {
  charter_id: string;
  account_id: string;
  name: string;
  status: 'submitted' | 'pmo_approved' | 'approved' | 'rejected' | 'withdrawn';
  rejected_stage: 'pmo' | 'bod' | null;
  pm_worker_id: string;
  budget_bmm: string | null;
  team_size: number | null;
  methodology: 'scrum' | 'kanban' | null;
  pricing_model: 'fixed_price' | 'time_materials' | null;
  created_at: string;
}

export interface CharterListResult {
  charters: CharterListRow[];
  total: number;
}

// A charter IS a project in a pre-approval state; the live project statuses
// (active/on_hold/closed) all collapse to the charter vocabulary 'approved'.
const APPROVED_PROJECT_STATUSES = ['active', 'on_hold', 'closed'] as const;

function toCharterStatus(status: string): CharterListRow['status'] {
  if ((APPROVED_PROJECT_STATUSES as readonly string[]).includes(status)) return 'approved';
  return status as CharterListRow['status'];
}

const SORT_COLUMN = {
  submitted: project.created_at,
  name: project.name,
  budget: project.budget_bmm,
  team: project.team_size,
} as const;

export async function listCharters(
  session: SessionScope,
  query?: CharterListQueryInput,
): Promise<CharterListResult> {
  requirePermission(session, 'pm.charter.read');
  const q = charterListQuery.parse(query ?? {});

  const conds = [tenantScoped(project.tenant_id, session)];
  if (q.status === 'approved') {
    conds.push(inArray(project.status, [...APPROVED_PROJECT_STATUSES]));
  } else if (q.status) {
    conds.push(eq(project.status, q.status));
  }
  if (q.account_id) conds.push(eq(project.account_id, q.account_id));
  if (q.q) conds.push(ilike(project.name, `%${q.q}%`));
  const where = and(...conds);

  const sortCol = SORT_COLUMN[q.sort];
  // Secondary key on id keeps paging deterministic when the sort column ties.
  const order =
    q.dir === 'asc' ? [asc(sortCol), asc(project.id)] : [desc(sortCol), desc(project.id)];

  const rows = await pmDb()
    .select({
      charter_id: project.id,
      account_id: project.account_id,
      name: project.name,
      status: project.status,
      rejected_stage: projectApproval.rejected_stage,
      pm_worker_id: project.pm_person_id,
      budget_bmm: project.budget_bmm,
      team_size: project.team_size,
      methodology: project.methodology,
      pricing_model: project.pricing_model,
      created_at: project.created_at,
    })
    .from(project)
    .leftJoin(projectApproval, eq(projectApproval.project_id, project.id))
    .where(where)
    .orderBy(...order)
    .limit(q.limit)
    .offset(q.offset);

  const totalRows = await pmDb().select({ total: count() }).from(project).where(where);

  return {
    total: Number(totalRows[0]?.total ?? 0),
    charters: rows.map((r) => ({
      charter_id: r.charter_id,
      account_id: r.account_id,
      name: r.name,
      status: toCharterStatus(r.status),
      rejected_stage: r.rejected_stage as 'pmo' | 'bod' | null,
      pm_worker_id: r.pm_worker_id as string,
      budget_bmm: r.budget_bmm,
      team_size: r.team_size,
      methodology: r.methodology as 'scrum' | 'kanban' | null,
      pricing_model: r.pricing_model as 'fixed_price' | 'time_materials' | null,
      created_at: r.created_at.toISOString(),
    })),
  };
}

export interface CharterSummary {
  total: number;
  submitted: number;
  pmo_approved: number;
  approved: number;
  rejected: number;
  withdrawn: number;
}

export async function getCharterSummary(session: SessionScope): Promise<CharterSummary> {
  requirePermission(session, 'pm.charter.read');
  const rows = await pmDb()
    .select({ status: project.status, n: count() })
    .from(project)
    .where(tenantScoped(project.tenant_id, session))
    .groupBy(project.status);
  const out: CharterSummary = {
    total: 0,
    submitted: 0,
    pmo_approved: 0,
    approved: 0,
    rejected: 0,
    withdrawn: 0,
  };
  for (const r of rows) {
    const n = Number(r.n);
    const bucket = toCharterStatus(r.status);
    if (bucket in out) out[bucket as keyof Omit<CharterSummary, 'total'>] += n;
    out.total += n;
  }
  return out;
}

export async function getCharter(input: { charter_id: string; session: SessionScope }) {
  const { charter_id, session } = input;
  requirePermission(session, 'pm.charter.read');
  const [c] = await pmDb()
    .select({
      id: project.id,
      account_id: project.account_id,
      name: project.name,
      pm_person_id: project.pm_person_id,
      pmo_person_id: project.pmo_person_id,
      budget_bmm: project.budget_bmm,
      team_size: project.team_size,
      methodology: project.methodology,
      pricing_model: project.pricing_model,
      date_from: project.date_from,
      date_to: project.date_to,
      objective: project.objective,
      scope: project.scope,
      status: project.status,
      version: project.version,
      rejection_reason: projectApproval.rejection_reason,
      rejected_stage: projectApproval.rejected_stage,
      pmo_signed_off_at: projectApproval.pmo_signed_off_at,
      submitted_by_user_id: projectApproval.submitted_by_user_id,
    })
    .from(project)
    .leftJoin(projectApproval, eq(projectApproval.project_id, project.id))
    .where(and(eq(project.id, charter_id), tenantScoped(project.tenant_id, session)))
    .limit(1);
  if (!c) throw new PmError('NOT_FOUND', 'charter not found');
  return {
    charter_id: c.id,
    account_id: c.account_id,
    name: c.name,
    pm_worker_id: c.pm_person_id,
    pmo_worker_id: c.pmo_person_id,
    budget_bmm: c.budget_bmm,
    team_size: c.team_size,
    methodology: c.methodology,
    pricing_model: c.pricing_model,
    date_from: c.date_from,
    date_to: c.date_to,
    objective: c.objective,
    scope: c.scope as { in: string; out: string } | null,
    status: toCharterStatus(c.status),
    rejection_reason: c.rejection_reason,
    rejected_stage: c.rejected_stage as 'pmo' | 'bod' | null,
    pmo_signed_off_at: c.pmo_signed_off_at ? c.pmo_signed_off_at.toISOString() : null,
    project_id: c.id,
    submitted_by_user_id: c.submitted_by_user_id,
    version: c.version,
  };
}
