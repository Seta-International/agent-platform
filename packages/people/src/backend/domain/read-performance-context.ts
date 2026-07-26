import type { SessionScope } from '@seta/core';
import { listAccountIdsManagedBy } from '@seta/pm';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type {
  PerformanceCapacity,
  PerformanceContext,
  PerformanceContextInput,
} from '../../contracts.ts';
import { peopleDb } from '../db/client.ts';
import {
  accountProjection,
  person,
  projectProjection,
  workerAllocationProjection,
} from '../db/schema.ts';
import { PeopleError, requirePermission } from '../rbac.ts';
import { vnYearMonth } from './month-clock.ts';

const KIND_RANK: Record<PerformanceCapacity['kind'], number> = { am: 0, tl: 1, member: 2 };

function capacityId(c: PerformanceCapacity): string {
  return c.kind === 'am' ? c.account_id : c.project_id;
}

/**
 * Month-scoped capacities for a person (EmployeePort allocation + AM ownership).
 * No "current month only" gate — callers that need that enforce it themselves.
 */
export async function loadPerformanceCapacities(
  session: SessionScope,
  personId: string,
  month: string,
): Promise<PerformanceCapacity[]> {
  const db = peopleDb();
  const monthStart = `${month}-01`;
  const inMonth = and(
    eq(workerAllocationProjection.active, true),
    or(
      isNull(workerAllocationProjection.date_from),
      sql`${workerAllocationProjection.date_from} < (${monthStart}::date + interval '1 month')`,
    ),
    or(
      isNull(workerAllocationProjection.date_to),
      sql`${workerAllocationProjection.date_to} >= ${monthStart}::date`,
    ),
  );

  const allocRows = await db
    .select({
      project_id: workerAllocationProjection.project_id,
      account_id: workerAllocationProjection.account_id,
      lead_person_id: workerAllocationProjection.lead_person_id,
      label: projectProjection.name,
    })
    .from(workerAllocationProjection)
    .innerJoin(
      projectProjection,
      eq(projectProjection.project_id, workerAllocationProjection.project_id),
    )
    .where(
      and(
        eq(workerAllocationProjection.tenant_id, session.tenant_id),
        or(
          eq(workerAllocationProjection.person_id, personId),
          eq(workerAllocationProjection.lead_person_id, personId),
        ),
        inMonth,
      ),
    );

  const byProject = new Map<string, PerformanceCapacity>();
  for (const r of allocRows) {
    const isLead = r.lead_person_id === personId;
    const existing = byProject.get(r.project_id);
    if (isLead || !existing) {
      byProject.set(r.project_id, {
        kind: isLead ? 'tl' : 'member',
        project_id: r.project_id,
        account_id: r.account_id,
        label: r.label,
      });
    }
  }

  const amAccountIds = await listAccountIdsManagedBy(personId, session.tenant_id);
  const amCapacities: PerformanceCapacity[] =
    amAccountIds.length > 0
      ? (
          await db
            .select({ account_id: accountProjection.account_id, label: accountProjection.name })
            .from(accountProjection)
            .where(
              and(
                eq(accountProjection.tenant_id, session.tenant_id),
                inArray(accountProjection.account_id, amAccountIds),
              ),
            )
        ).map((a) => ({ kind: 'am' as const, account_id: a.account_id, label: a.label }))
      : [];

  return [...amCapacities, ...byProject.values()].sort(
    (a, b) =>
      KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
      a.label.localeCompare(b.label) ||
      capacityId(a).localeCompare(capacityId(b)),
  );
}

/**
 * The Performance surface's read-only "EmployeePort": identity + RBAC roles +
 * month-scoped capacities (Member/TL from allocation projections, AM from
 * pm.account ownership). Consumer-only by construction — selects only, no
 * person/hierarchy writes on any path (AC1).
 *
 * Only the current month is accepted: the org tree and allocations have no
 * historical snapshot yet, so past months cannot be answered truthfully.
 * Historical as-of-month is a follow-up story (needs org snapshot projection).
 */
export async function readPerformanceContext(
  session: SessionScope,
  input: PerformanceContextInput,
): Promise<PerformanceContext> {
  requirePermission(session, 'people.performance.read');

  const currentMonth = vnYearMonth();
  if (input.as_of_month !== currentMonth) {
    throw new PeopleError('VALIDATION', 'as_of_month: only the current month is supported');
  }
  if (!session.person_id) return { status: 'no_employee_record' };
  const me = session.person_id;
  const db = peopleDb();

  const [p] = await db
    .select({ full_name: person.full_name, org_unit_id: person.org_unit_id })
    .from(person)
    .where(
      and(eq(person.id, me), eq(person.tenant_id, session.tenant_id), isNull(person.deleted_at)),
    );
  if (!p) return { status: 'no_employee_record' };

  const capacities = await loadPerformanceCapacities(session, me, input.as_of_month);

  return {
    status: 'ok',
    as_of_month: input.as_of_month,
    person: { person_id: me, full_name: p.full_name, org_unit_id: p.org_unit_id },
    role_slugs: [...session.role_summary.roles],
    capacities,
    default_capacity_index: capacities.length > 0 ? 0 : -1,
  };
}
