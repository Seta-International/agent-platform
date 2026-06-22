import type { SessionScope } from '@seta/core';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { peopleDb } from '../db/client.ts';
import {
  accountProjection,
  orgUnit,
  projectProjection,
  worker,
  workerAllocationProjection,
} from '../db/schema.ts';
import { tenantScoped } from '../db/scope.ts';
import { requirePermission } from '../rbac.ts';
import { buildWorkerScope } from './worker-scope.ts';

export interface OrgUnitNode {
  id: string;
  parent_id: string | null;
  name: string;
  kind: string;
  sort: number;
  head: { person_id: string; full_name: string } | null;
}

export async function getOrgStructure(session: SessionScope): Promise<{ units: OrgUnitNode[] }> {
  requirePermission(session, 'people.worker.read');

  const units = await peopleDb()
    .select()
    .from(orgUnit)
    .where(tenantScoped(orgUnit.tenant_id, session))
    .orderBy(asc(orgUnit.sort), asc(orgUnit.name));

  // Resolve head display names from the scope-visible workers (head ids without a visible worker → null).
  const scope = buildWorkerScope(session);
  const rows = await peopleDb()
    .select({ person_id: worker.person_id, full_name: worker.full_name })
    .from(worker)
    .where(
      and(tenantScoped(worker.tenant_id, session), isNull(worker.deleted_at), scope ?? undefined),
    );
  const nameByPerson = new Map(rows.map((r) => [r.person_id, r.full_name]));

  return {
    units: units.map((u) => ({
      id: u.id,
      parent_id: u.parent_id,
      name: u.name,
      kind: u.kind,
      sort: u.sort,
      head:
        u.head_worker_id && nameByPerson.has(u.head_worker_id)
          ? { person_id: u.head_worker_id, full_name: nameByPerson.get(u.head_worker_id)! }
          : null,
    })),
  };
}

export interface DeliveryAccount {
  account_id: string;
  name: string;
  am: { person_id: string; full_name: string } | null;
  projects: Array<{
    project_id: string;
    name: string;
    members: Array<{ person_id: string; full_name: string; is_lead: boolean }>;
  }>;
}

export async function getOrgDelivery(
  session: SessionScope,
): Promise<{ accounts: DeliveryAccount[] }> {
  requirePermission(session, 'people.worker.read');
  const tenantId = session.tenant_id;
  const scope = buildWorkerScope(session);

  // Visible workers gate which allocations/accounts appear (read.all ⇒ scope null ⇒ all).
  const visibleWorkers = await peopleDb()
    .select({ person_id: worker.person_id, full_name: worker.full_name })
    .from(worker)
    .where(
      and(tenantScoped(worker.tenant_id, session), isNull(worker.deleted_at), scope ?? undefined),
    );
  const nameByPerson = new Map(visibleWorkers.map((w) => [w.person_id, w.full_name]));
  const seeAll = !scope;

  const accounts = await peopleDb()
    .select()
    .from(accountProjection)
    .where(eq(accountProjection.tenant_id, tenantId));
  const projects = await peopleDb()
    .select()
    .from(projectProjection)
    .where(eq(projectProjection.tenant_id, tenantId));
  const allocs = await peopleDb()
    .select()
    .from(workerAllocationProjection)
    .where(
      and(
        eq(workerAllocationProjection.tenant_id, tenantId),
        eq(workerAllocationProjection.active, true),
      ),
    );

  const allocByProject = new Map<string, typeof allocs>();
  for (const a of allocs) {
    const arr = allocByProject.get(a.project_id) ?? [];
    arr.push(a);
    allocByProject.set(a.project_id, arr);
  }
  const projByAccount = new Map<string, typeof projects>();
  for (const p of projects) {
    const arr = projByAccount.get(p.account_id) ?? [];
    arr.push(p);
    projByAccount.set(p.account_id, arr);
  }

  const out: DeliveryAccount[] = [];
  for (const acc of accounts) {
    const accProjects = (projByAccount.get(acc.account_id) ?? []).map((p) => ({
      project_id: p.project_id,
      name: p.name,
      members: (allocByProject.get(p.project_id) ?? [])
        .filter((a) => a.worker_id && (seeAll || nameByPerson.has(a.worker_id)))
        .map((a) => ({
          person_id: a.worker_id!,
          full_name: nameByPerson.get(a.worker_id!) ?? '',
          is_lead: a.lead_worker_id === a.worker_id,
        })),
    }));
    const amVisible = acc.am_worker_id && (seeAll || nameByPerson.has(acc.am_worker_id));
    const hasMembers = accProjects.some((p) => p.members.length > 0);
    // Show an account if the viewer manages it, or can see any of its allocated members.
    if (!seeAll && !amVisible && !hasMembers) continue;
    out.push({
      account_id: acc.account_id,
      name: acc.name,
      am:
        acc.am_worker_id && nameByPerson.has(acc.am_worker_id)
          ? { person_id: acc.am_worker_id, full_name: nameByPerson.get(acc.am_worker_id)! }
          : acc.am_worker_id && seeAll
            ? { person_id: acc.am_worker_id, full_name: '' }
            : null,
      projects: accProjects,
    });
  }
  return { accounts: out };
}
