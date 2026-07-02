import type { SessionScope } from '@seta/core';
import { tenantScoped } from '@seta/shared-rbac';
import { and, asc, count, desc, eq, ilike } from 'drizzle-orm';
import { type CharterListQueryInput, charterListQuery } from '../../contracts.ts';
import { pmDb } from '../db/client.ts';
import { charter } from '../db/schema.ts';
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

const SORT_COLUMN = {
  submitted: charter.created_at,
  name: charter.name,
  budget: charter.budget_bmm,
  team: charter.team_size,
} as const;

export async function listCharters(
  session: SessionScope,
  query?: CharterListQueryInput,
): Promise<CharterListResult> {
  requirePermission(session, 'pm.charter.read');
  const q = charterListQuery.parse(query ?? {});

  const conds = [tenantScoped(charter.tenant_id, session)];
  if (q.status) conds.push(eq(charter.status, q.status));
  if (q.account_id) conds.push(eq(charter.account_id, q.account_id));
  if (q.q) conds.push(ilike(charter.name, `%${q.q}%`));
  const where = and(...conds);

  const sortCol = SORT_COLUMN[q.sort];
  // Secondary key on id keeps paging deterministic when the sort column ties.
  const order =
    q.dir === 'asc' ? [asc(sortCol), asc(charter.id)] : [desc(sortCol), desc(charter.id)];

  const rows = await pmDb()
    .select({
      charter_id: charter.id,
      account_id: charter.account_id,
      name: charter.name,
      status: charter.status,
      rejected_stage: charter.rejected_stage,
      pm_worker_id: charter.pm_worker_id,
      budget_bmm: charter.budget_bmm,
      team_size: charter.team_size,
      methodology: charter.methodology,
      pricing_model: charter.pricing_model,
      created_at: charter.created_at,
    })
    .from(charter)
    .where(where)
    .orderBy(...order)
    .limit(q.limit)
    .offset(q.offset);

  const totalRows = await pmDb().select({ total: count() }).from(charter).where(where);

  return {
    total: Number(totalRows[0]?.total ?? 0),
    charters: rows.map((r) => ({
      ...r,
      status: r.status as CharterListRow['status'],
      rejected_stage: r.rejected_stage as 'pmo' | 'bod' | null,
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
    .select({ status: charter.status, n: count() })
    .from(charter)
    .where(tenantScoped(charter.tenant_id, session))
    .groupBy(charter.status);
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
    if (r.status in out) out[r.status as keyof Omit<CharterSummary, 'total'>] = n;
    out.total += n;
  }
  return out;
}

export async function getCharter(input: { charter_id: string; session: SessionScope }) {
  const { charter_id, session } = input;
  requirePermission(session, 'pm.charter.read');
  const [c] = await pmDb()
    .select()
    .from(charter)
    .where(and(eq(charter.id, charter_id), tenantScoped(charter.tenant_id, session)))
    .limit(1);
  if (!c) throw new PmError('NOT_FOUND', 'charter not found');
  return {
    charter_id: c.id,
    account_id: c.account_id,
    name: c.name,
    pm_worker_id: c.pm_worker_id,
    pmo_worker_id: c.pmo_worker_id,
    budget_bmm: c.budget_bmm,
    team_size: c.team_size,
    methodology: c.methodology,
    pricing_model: c.pricing_model,
    date_from: c.date_from,
    date_to: c.date_to,
    objective: c.objective,
    scope: c.scope as { in: string; out: string } | null,
    status: c.status,
    rejection_reason: c.rejection_reason,
    rejected_stage: c.rejected_stage as 'pmo' | 'bod' | null,
    pmo_signed_off_at: c.pmo_signed_off_at ? c.pmo_signed_off_at.toISOString() : null,
    project_id: c.project_id,
    submitted_by_user_id: c.submitted_by_user_id,
    version: c.version,
  };
}
