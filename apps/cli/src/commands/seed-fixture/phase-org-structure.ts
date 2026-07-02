import type { SessionScope } from '@seta/core';
import { coreDb } from '@seta/core/db';
import { createOrgUnit, editWorker } from '@seta/people';
import { sql } from 'drizzle-orm';
import pino from 'pino';
import type { AllocationRec, EmployeeRec, LeadershipRec, ProjectRec } from './load.ts';

const log = pino({ name: 'cli/seed-fixture/org' });

// Operation function units, in display order. Sourced from the real fixture `dept` column
// (projects.csv); these are the internal SETA departments, design-aligned where they overlap
// the prototype's ORG_OPS (Back Office, IT, Internal Communication, Sales, L&D) plus the
// real-only ones the fixture carries (R&D, Project Support). HR folds into Back Office —
// the fixture has no separate HR project.
const OPERATION_FUNCTIONS = [
  'Back Office',
  'Information Technology',
  'Internal Communication',
  'Sales',
  'Learning & Development',
  'R&D',
  'Project Support',
] as const;
const DELIVERY_DEPT = 'Delivery';
const PMO_DEPT = 'PMO';

async function findOrgUnitId(tenantId: string, name: string): Promise<string | undefined> {
  const r = await coreDb().execute(
    sql`SELECT id FROM people.org_unit WHERE tenant_id = ${tenantId} AND name = ${name} LIMIT 1`,
  );
  return (r.rows[0] as { id: string } | undefined)?.id;
}

async function ensureUnit(
  session: SessionScope,
  name: string,
  kind: 'executive' | 'operation' | 'function' | 'delivery' | 'pmo',
  parentId: string | null,
  headWorkerId: string | null,
): Promise<string> {
  const existing = await findOrgUnitId(session.tenant_id, name);
  if (existing) return existing;
  const { org_unit_id } = await createOrgUnit({
    name,
    kind,
    parent_id: parentId,
    head_worker_id: headWorkerId,
    session,
  });
  return org_unit_id;
}

/** project_code → dept, from the fixture's `dept` column. */
function deptByProjectCode(projects: ProjectRec[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of projects) if (p.dept) m.set(p.code, p.dept);
  return m;
}

/**
 * employee_id → the dept of their *primary* allocation (highest ratio_pct, ties broken by
 * man_days then first-seen). This is the worker's HR home unit — distinct from the delivery
 * lens, where the same worker appears under the specific account/project they're staffed on.
 */
function primaryDeptByEmployee(
  allocations: AllocationRec[],
  deptByCode: Map<string, string>,
): Map<string, string> {
  const best = new Map<string, { dept: string; ratio: number; manDays: number }>();
  for (const a of allocations) {
    const dept = deptByCode.get(a.project_code);
    if (!dept || !a.employee_id) continue;
    const cur = best.get(a.employee_id);
    if (
      !cur ||
      a.ratio_pct > cur.ratio ||
      (a.ratio_pct === cur.ratio && a.man_days > cur.manDays)
    ) {
      best.set(a.employee_id, { dept, ratio: a.ratio_pct, manDays: a.man_days });
    }
  }
  return new Map([...best].map(([id, v]) => [id, v.dept]));
}

export interface TopLevelDeliveryUnit {
  id: string;
  name: string;
  head_worker_id: string | null;
}

/** Top-level (direct child of Executive) org units of kind 'delivery' — the fixture's demo
 * hook for org-scoped roles (each becomes a delivery-lead group in phase-access-groups). */
async function fetchTopLevelDeliveryUnits(
  tenantId: string,
  execId: string,
): Promise<TopLevelDeliveryUnit[]> {
  const r = await coreDb().execute(sql`
    SELECT id, name, head_worker_id FROM people.org_unit
    WHERE tenant_id = ${tenantId} AND parent_id = ${execId} AND kind = 'delivery'
    ORDER BY name`);
  return r.rows as unknown as TopLevelDeliveryUnit[];
}

/**
 * Seed the org spine — Executive → Operation(+ real function units) / Delivery / PMO — set unit
 * heads from leadership.csv, and place each worker into a unit by (1) an explicit leadership
 * org_unit override, else (2) their primary allocation's dept, else (3) a primary_role fallback.
 * Idempotent: units reused by name, editWorker no-ops when org_unit_id is unchanged. Must run
 * after people + PM so workers and allocations exist. Returns the top-level delivery units (with
 * heads, resolved after backfillManagers) so a later phase can seed org-scoped fixture groups.
 */
export async function seedOrgStructure(
  session: SessionScope,
  employees: EmployeeRec[],
  projects: ProjectRec[],
  allocations: AllocationRec[],
  leadership: LeadershipRec[],
  people: Map<string, { workerId: string; userId: string }>,
): Promise<{ topLevelDeliveryUnits: TopLevelDeliveryUnit[] }> {
  const deptByCode = deptByProjectCode(projects);
  const primaryDept = primaryDeptByEmployee(allocations, deptByCode);

  // Leadership (from leadership.csv): unit-name → head workerId, and employee → unit override.
  const headByUnitName = new Map<string, string>();
  const overrideByEmployee = new Map<string, string>();
  for (const l of leadership) {
    const person = people.get(l.employee_id);
    if (!person) continue;
    if (l.org_unit) overrideByEmployee.set(l.employee_id, l.org_unit);
    if (l.head?.trim().toUpperCase() === 'Y' && l.org_unit) {
      headByUnitName.set(l.org_unit, person.workerId);
    }
  }

  const unitByName = new Map<string, string>();
  const ensure = async (
    name: string,
    kind: 'executive' | 'operation' | 'function' | 'delivery' | 'pmo',
    parentId: string | null,
  ): Promise<string> => {
    const id = await ensureUnit(session, name, kind, parentId, headByUnitName.get(name) ?? null);
    unitByName.set(name, id);
    return id;
  };

  const exec = await ensure('Executive', 'executive', null);
  const operation = await ensure('Operation', 'operation', exec);
  const unitByDept = new Map<string, string>();
  for (const name of OPERATION_FUNCTIONS) {
    unitByDept.set(name, await ensure(name, 'function', operation));
  }
  const delivery = await ensure('Delivery', 'delivery', exec);
  const pmo = await ensure('PMO', 'pmo', exec);
  unitByDept.set(DELIVERY_DEPT, delivery);
  unitByDept.set(PMO_DEPT, pmo);
  const backOffice = unitByName.get('Back Office') ?? delivery;

  // Fallback unit for the unallocated, by primary_role.
  function fallbackUnit(role: string): string {
    const r = role.toUpperCase().trim();
    if (r === 'PRODUCT DIRECTOR' || r === 'DIRECTOR') return exec;
    if (r === 'PM') return pmo;
    if (r === 'ADMIN') return backOffice;
    return delivery;
  }

  let placed = 0;
  for (const e of employees) {
    const person = people.get(e.id);
    if (!person) continue;
    const override = overrideByEmployee.get(e.id);
    const dept = primaryDept.get(e.id);
    const unitId =
      (override ? unitByName.get(override) : undefined) ??
      (dept ? unitByDept.get(dept) : undefined) ??
      fallbackUnit(e.primary_role ?? '');
    await editWorker({ worker_id: person.workerId, patch: { org_unit_id: unitId }, session });
    placed++;
  }

  await backfillManagers(session.tenant_id);

  const topLevelDeliveryUnits = await fetchTopLevelDeliveryUnits(session.tenant_id, exec);

  log.info(
    { units: OPERATION_FUNCTIONS.length + 4, placed, deliveryUnits: topLevelDeliveryUnits.length },
    'phase: org-structure done (units derived from fixture depts)',
  );

  return { topLevelDeliveryUnits };
}

/**
 * Mock the directory's direct-manager field. leadership.csv only names a couple of unit heads, so
 * (1) give every still-headless unit a head — its most senior member, then a child unit's head for
 * empty structural units — and (2) set each worker's stored manager_id to their unit's head (the
 * parent unit's head when the worker *is* the head). Pure backfill: only fills nulls / recomputes.
 */
async function backfillManagers(tenantId: string): Promise<void> {
  // Head = most senior (earliest-hired) member of the unit.
  await coreDb().execute(sql`
    UPDATE people.org_unit ou SET head_worker_id = (
      SELECT w.person_id FROM people.worker w
        JOIN people.person p ON p.id = w.person_id
        WHERE w.org_unit_id = ou.id AND w.tenant_id = ou.tenant_id AND w.deleted_at IS NULL
        ORDER BY p.original_hire_date NULLS LAST, w.full_name
        LIMIT 1)
    WHERE ou.tenant_id = ${tenantId} AND ou.head_worker_id IS NULL`);

  // Empty structural units (no direct members) borrow a child unit's head, so their descendants'
  // heads still resolve a manager up the chain.
  await coreDb().execute(sql`
    UPDATE people.org_unit ou SET head_worker_id = (
      SELECT c.head_worker_id FROM people.org_unit c
        WHERE c.parent_id = ou.id AND c.tenant_id = ou.tenant_id AND c.head_worker_id IS NOT NULL
        ORDER BY c.name
        LIMIT 1)
    WHERE ou.tenant_id = ${tenantId} AND ou.head_worker_id IS NULL`);

  // manager_id = unit head, or the parent unit's head when the worker is their unit's head.
  await coreDb().execute(sql`
    UPDATE people.worker w SET manager_id = (
      SELECT CASE
               WHEN ou.head_worker_id = w.person_id THEN parent_ou.head_worker_id
               ELSE ou.head_worker_id
             END
        FROM people.org_unit ou
        LEFT JOIN people.org_unit parent_ou ON parent_ou.id = ou.parent_id
        WHERE ou.id = w.org_unit_id AND ou.tenant_id = w.tenant_id)
    WHERE w.tenant_id = ${tenantId} AND w.deleted_at IS NULL`);
}
