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

/**
 * Seed the org spine — Executive → Operation(+ real function units) / Delivery / PMO — set unit
 * heads from leadership.csv, and place each worker into a unit by (1) an explicit leadership
 * org_unit override, else (2) their primary allocation's dept, else (3) a primary_role fallback.
 * Idempotent: units reused by name, editWorker no-ops when org_unit_id is unchanged. Must run
 * after people + PM so workers and allocations exist.
 */
export async function seedOrgStructure(
  session: SessionScope,
  employees: EmployeeRec[],
  projects: ProjectRec[],
  allocations: AllocationRec[],
  leadership: LeadershipRec[],
  people: Map<string, { workerId: string; userId: string }>,
): Promise<void> {
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

  log.info(
    { units: OPERATION_FUNCTIONS.length + 4, placed },
    'phase: org-structure done (units derived from fixture depts)',
  );
}
