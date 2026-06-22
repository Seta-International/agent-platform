import type { SessionScope } from '@seta/core';
import { coreDb } from '@seta/core/db';
import { createOrgUnit, editWorker } from '@seta/people';
import { sql } from 'drizzle-orm';
import pino from 'pino';
import type { EmployeeRec } from './load.ts';

const log = pino({ name: 'cli/seed-fixture/org' });

// The six Operation function buckets from the prototype (docs/design ORG_OPS).
const FUNCTION_UNITS = [
  'Back Office',
  'Human Resources',
  'Learning & Development',
  'Internal Communication',
  'Information Technology',
  'Sales',
] as const;

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

// Map an employee's primary_role to the unit that owns them. Delivery is the default
// home for individual contributors; PM staff seed the PMO; ADMIN/Director seed leadership.
function placementUnit(
  role: string,
  units: { exec: string; pmo: string; delivery: string },
): string {
  const r = role.toUpperCase().trim();
  if (r === 'ADMIN' || r === 'PRODUCT DIRECTOR' || r === 'DIRECTOR') return units.exec;
  if (r === 'PM') return units.pmo;
  return units.delivery;
}

/**
 * Seed the real org spine — Executive → Operation(+6 functions)/Delivery/PMO — and place each
 * seeded worker into a unit by role. Idempotent: units are reused by name, and editWorker
 * no-ops when org_unit_id is already set. Must run after people + PM so workers exist.
 */
export async function seedOrgStructure(
  session: SessionScope,
  employees: EmployeeRec[],
  people: Map<string, { workerId: string; userId: string }>,
): Promise<void> {
  // Executive head: prefer an ADMIN, then a Product Director, else the first seeded worker.
  const headEmployee =
    employees.find((e) => e.primary_role?.toUpperCase().trim() === 'ADMIN' && people.has(e.id)) ??
    employees.find(
      (e) => e.primary_role?.toUpperCase().trim() === 'PRODUCT DIRECTOR' && people.has(e.id),
    ) ??
    employees.find((e) => people.has(e.id));
  const execHeadWorkerId = headEmployee ? (people.get(headEmployee.id)?.workerId ?? null) : null;

  const exec = await ensureUnit(session, 'Executive', 'executive', null, execHeadWorkerId);
  const operation = await ensureUnit(session, 'Operation', 'operation', exec, null);
  for (const name of FUNCTION_UNITS) {
    await ensureUnit(session, name, 'function', operation, null);
  }
  const delivery = await ensureUnit(session, 'Delivery', 'delivery', exec, null);
  const pmo = await ensureUnit(session, 'PMO', 'pmo', exec, null);

  const units = { exec, pmo, delivery };
  let placed = 0;
  for (const e of employees) {
    const person = people.get(e.id);
    if (!person) continue;
    const unitId = placementUnit(e.primary_role ?? '', units);
    await editWorker({ worker_id: person.workerId, patch: { org_unit_id: unitId }, session });
    placed++;
  }

  log.info({ units: FUNCTION_UNITS.length + 4, placed }, 'phase: org-structure done');
}
