import type { SessionScope } from '@seta/core';
import { and, desc, eq } from 'drizzle-orm';
import { pmDb } from '../db/client.ts';
import { charter } from '../db/schema.ts';
import { tenantScoped } from '../db/scope.ts';
import { PmError, requirePermission } from '../rbac.ts';

export interface CharterListRow {
  charter_id: string;
  account_id: string;
  name: string;
  status: 'submitted' | 'approved' | 'rejected' | 'withdrawn';
  pm_worker_id: string;
  created_at: string;
}

export async function listCharters(session: SessionScope): Promise<CharterListRow[]> {
  requirePermission(session, 'pm.charter.read');
  const rows = await pmDb()
    .select({
      charter_id: charter.id,
      account_id: charter.account_id,
      name: charter.name,
      status: charter.status,
      pm_worker_id: charter.pm_worker_id,
      created_at: charter.created_at,
    })
    .from(charter)
    .where(tenantScoped(charter.tenant_id, session))
    .orderBy(desc(charter.created_at));
  return rows.map((r) => ({
    ...r,
    status: r.status as CharterListRow['status'],
    created_at: r.created_at.toISOString(),
  }));
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
    project_id: c.project_id,
    submitted_by_user_id: c.submitted_by_user_id,
    version: c.version,
  };
}
