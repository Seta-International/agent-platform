import type { SessionScope } from '@seta/core';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { pmDb } from '../db/client.ts';
import { account, accountRecruiter, project } from '../db/schema.ts';
import { tenantScoped } from '../db/scope.ts';
import { PmError, requirePermission } from '../rbac.ts';
import { buildAccountScope } from './scope.ts';

export interface AccountListRow {
  account_id: string;
  name: string;
  industry: string | null;
  am_worker_id: string | null;
  recruiter_count: number;
  project_count: number;
}

export async function listAccounts(session: SessionScope): Promise<AccountListRow[]> {
  requirePermission(session, 'pm.account.read');

  const conds = [tenantScoped(account.tenant_id, session)];
  const scope = buildAccountScope(session);
  if (scope) conds.push(scope);
  const accounts = await pmDb()
    .select({
      account_id: account.id,
      name: account.name,
      industry: account.industry,
      am_worker_id: account.am_worker_id,
    })
    .from(account)
    .where(and(...conds))
    .orderBy(account.name);

  const recruiterCounts = await pmDb()
    .select({ account_id: accountRecruiter.account_id, n: sql<number>`count(*)::int` })
    .from(accountRecruiter)
    .where(tenantScoped(accountRecruiter.tenant_id, session))
    .groupBy(accountRecruiter.account_id);
  const projectCounts = await pmDb()
    .select({ account_id: project.account_id, n: sql<number>`count(*)::int` })
    .from(project)
    .where(and(tenantScoped(project.tenant_id, session), isNull(project.deleted_at)))
    .groupBy(project.account_id);

  const recMap = new Map(recruiterCounts.map((r) => [r.account_id, r.n]));
  const projMap = new Map(projectCounts.map((r) => [r.account_id, r.n]));
  return accounts.map((a) => ({
    ...a,
    recruiter_count: recMap.get(a.account_id) ?? 0,
    project_count: projMap.get(a.account_id) ?? 0,
  }));
}

export async function getAccount(input: { account_id: string; session: SessionScope }): Promise<{
  account_id: string;
  name: string;
  industry: string | null;
  am_worker_id: string | null;
  version: number;
  recruiter_worker_ids: string[];
}> {
  const { account_id, session } = input;
  requirePermission(session, 'pm.account.read');

  const conds = [eq(account.id, account_id), tenantScoped(account.tenant_id, session)];
  const scope = buildAccountScope(session);
  if (scope) conds.push(scope);
  const [a] = await pmDb()
    .select()
    .from(account)
    .where(and(...conds))
    .limit(1);
  // Invisible-through-scope rows return NOT_FOUND, never FORBIDDEN — don't leak existence.
  if (!a) throw new PmError('NOT_FOUND', 'account not found');

  const recs = await pmDb()
    .select({ id: accountRecruiter.recruiter_worker_id })
    .from(accountRecruiter)
    .where(
      and(
        eq(accountRecruiter.account_id, account_id),
        tenantScoped(accountRecruiter.tenant_id, session),
      ),
    );

  return {
    account_id: a.id,
    name: a.name,
    industry: a.industry,
    am_worker_id: a.am_worker_id,
    version: a.version,
    recruiter_worker_ids: recs.map((r) => r.id),
  };
}
