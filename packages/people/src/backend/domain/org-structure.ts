import type { SessionScope } from '@seta/core';
import { listAccountManagers } from '@seta/pm';
import { tenantScoped } from '@seta/shared-rbac';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { peopleDb } from '../db/client.ts';
import {
  accountProjection,
  employmentPeriod,
  orgUnit,
  person,
  projectProjection,
  workerAllocationProjection,
} from '../db/schema.ts';
import { requirePermission } from '../rbac.ts';
import { personPhotoUrl } from './photo.ts';

/** Person identity as every org-chart node renders it: name for the label, photo for the avatar. */
export interface OrgPersonRef {
  person_id: string;
  full_name: string;
  photo_url: string | null;
}

export interface OrgUnitNode {
  id: string;
  parent_id: string | null;
  name: string;
  kind: string;
  sort: number;
  head: OrgPersonRef | null;
  members: Array<OrgPersonRef & { job_title: string | null }>;
}

export async function getOrgStructure(session: SessionScope): Promise<{ units: OrgUnitNode[] }> {
  requirePermission(session, 'people.worker.read');

  const units = await peopleDb()
    .select()
    .from(orgUnit)
    .where(tenantScoped(orgUnit.tenant_id, session))
    .orderBy(asc(orgUnit.sort), asc(orgUnit.name));

  const rows = await peopleDb()
    .select({
      person_id: person.id,
      full_name: sql<string>`coalesce(${person.full_name}, '')`,
      job_title: employmentPeriod.job_title,
      org_unit_id: person.org_unit_id,
      photo_storage_key: person.photo_storage_key,
    })
    .from(person)
    .leftJoin(
      employmentPeriod,
      and(eq(employmentPeriod.person_id, person.id), isNull(employmentPeriod.end_date)),
    )
    .where(and(tenantScoped(person.tenant_id, session), isNull(person.deleted_at)));

  const refByPerson = new Map<string, OrgPersonRef>();
  const membersByUnit = new Map<string, Array<OrgPersonRef & { job_title: string | null }>>();
  for (const r of rows) {
    const ref: OrgPersonRef = {
      person_id: r.person_id,
      full_name: r.full_name,
      photo_url: personPhotoUrl(r.person_id, r.photo_storage_key),
    };
    refByPerson.set(r.person_id, ref);
    if (!r.org_unit_id) continue;
    const arr = membersByUnit.get(r.org_unit_id) ?? [];
    arr.push({ ...ref, job_title: r.job_title });
    membersByUnit.set(r.org_unit_id, arr);
  }

  return {
    units: units.map((u) => ({
      id: u.id,
      parent_id: u.parent_id,
      name: u.name,
      kind: u.kind,
      sort: u.sort,
      head: (u.head_worker_id && refByPerson.get(u.head_worker_id)) || null,
      members: membersByUnit.get(u.id) ?? [],
    })),
  };
}

export interface DeliveryAccount {
  account_id: string;
  name: string;
  am: OrgPersonRef | null;
  projects: Array<{
    project_id: string;
    name: string;
    members: Array<OrgPersonRef & { is_lead: boolean }>;
  }>;
}

export async function getOrgDelivery(
  session: SessionScope,
): Promise<{ accounts: DeliveryAccount[] }> {
  requirePermission(session, 'people.worker.read');
  const tenantId = session.tenant_id;

  const workers = await peopleDb()
    .select({
      person_id: person.id,
      full_name: person.full_name,
      photo_storage_key: person.photo_storage_key,
    })
    .from(person)
    .where(and(tenantScoped(person.tenant_id, session), isNull(person.deleted_at)));
  const refByPerson = new Map<string, OrgPersonRef>(
    workers.map((w) => [
      w.person_id,
      {
        person_id: w.person_id,
        full_name: w.full_name ?? '',
        photo_url: personPhotoUrl(w.person_id, w.photo_storage_key),
      },
    ]),
  );
  const refFor = (person_id: string): OrgPersonRef =>
    refByPerson.get(person_id) ?? { person_id, full_name: '', photo_url: null };

  const accounts = await peopleDb()
    .select({ account_id: accountProjection.account_id, name: accountProjection.name })
    .from(accountProjection)
    .where(eq(accountProjection.tenant_id, tenantId));
  const amRows = await listAccountManagers(tenantId);
  const amByAccount = new Map(amRows.map((a) => [a.account_id, a.am_person_id]));
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
        .filter((a) => a.person_id)
        .map((a) => ({
          ...refFor(a.person_id ?? ''),
          is_lead: a.lead_person_id === a.person_id,
        })),
    }));
    const amId = amByAccount.get(acc.account_id);
    out.push({
      account_id: acc.account_id,
      name: acc.name,
      am: amId ? refFor(amId) : null,
      projects: accProjects,
    });
  }
  return { accounts: out };
}

export type CompanyNodeKind =
  | 'executive'
  | 'operation'
  | 'function'
  | 'delivery'
  | 'pmo'
  | 'am'
  | 'account';

export interface CompanyNode {
  id: string;
  parent_id: string | null;
  kind: CompanyNodeKind;
  label: string;
  sublabel?: string;
  count?: number;
  person_id?: string;
  account_id?: string;
  /** Only ever set on `am` nodes — the other kinds render a type glyph, not an avatar. */
  photo_url?: string | null;
}

const UNIT_KINDS = new Set<CompanyNodeKind>([
  'executive',
  'operation',
  'function',
  'delivery',
  'pmo',
]);

/**
 * The Company tab tree. The org-unit spine comes from the stored `org_unit.parent_id`; the
 * Delivery → AM → account subtree is derived from `getOrgDelivery` (visibility matches the
 * Account tab exactly). No member/project leaves. All parent links are returned as data.
 */
export async function getOrgCompany(session: SessionScope): Promise<{ nodes: CompanyNode[] }> {
  requirePermission(session, 'people.worker.read');

  const units = await peopleDb()
    .select()
    .from(orgUnit)
    .where(tenantScoped(orgUnit.tenant_id, session))
    .orderBy(asc(orgUnit.sort), asc(orgUnit.name));

  const memberRows = await peopleDb()
    .select({ org_unit_id: person.org_unit_id })
    .from(person)
    .where(and(tenantScoped(person.tenant_id, session), isNull(person.deleted_at)));
  const countByUnit = new Map<string, number>();
  for (const r of memberRows) {
    if (r.org_unit_id) countByUnit.set(r.org_unit_id, (countByUnit.get(r.org_unit_id) ?? 0) + 1);
  }

  const nodes: CompanyNode[] = units.map((u) => ({
    id: `unit:${u.id}`,
    parent_id: u.parent_id ? `unit:${u.parent_id}` : null,
    kind: (UNIT_KINDS.has(u.kind as CompanyNodeKind) ? u.kind : 'function') as CompanyNodeKind,
    label: u.name,
    count: countByUnit.get(u.id) ?? 0,
  }));

  const deliveryUnit = units.find((u) => u.kind === 'delivery');
  if (deliveryUnit) {
    const { accounts } = await getOrgDelivery(session);
    const amEmitted = new Set<string>();
    for (const acc of accounts) {
      let parentId = `unit:${deliveryUnit.id}`;
      if (acc.am?.full_name) {
        const amNodeId = `am:${acc.am.person_id}`;
        if (!amEmitted.has(acc.am.person_id)) {
          amEmitted.add(acc.am.person_id);
          nodes.push({
            id: amNodeId,
            parent_id: `unit:${deliveryUnit.id}`,
            kind: 'am',
            label: acc.am.full_name,
            sublabel: 'Account Manager',
            person_id: acc.am.person_id,
            photo_url: acc.am.photo_url,
          });
        }
        parentId = amNodeId;
      }
      nodes.push({
        id: `account:${acc.account_id}`,
        parent_id: parentId,
        kind: 'account',
        label: acc.name,
        count: acc.projects.length,
        account_id: acc.account_id,
      });
    }
  }

  return { nodes };
}
