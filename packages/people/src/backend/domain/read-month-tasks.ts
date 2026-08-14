import type { SessionScope } from '@seta/core';
import { and, eq, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import type {
  CycleStatus,
  MonthTaskCard,
  MonthTaskGroup,
  MonthTasksQuery,
  MonthTasksResponse,
  PerformanceCapacity,
} from '../../contracts.ts';
import { peopleDb } from '../db/client.ts';
import { person, workerAllocationProjection } from '../db/schema.ts';
import { requirePermission } from '../rbac.ts';
import { unlockedAccountIds } from './cycle-unlock.ts';
import { classifyCycleStatus, monthClockNow } from './month-clock.ts';
import { loadPerformanceCapacities } from './read-performance-context.ts';

function capacityGroupLabel(c: PerformanceCapacity): string {
  if (c.kind === 'am') return `As AM · ${c.label}`;
  if (c.kind === 'tl') return `As TL · ${c.label}`;
  return `As Member · ${c.label}`;
}

function allocationInMonth(month: string) {
  const monthStart = `${month}-01`;
  return and(
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
}

/** People to score under a TL project (exclude the evaluator). */
async function countProjectMembersToScore(
  tenantId: string,
  projectId: string,
  evaluatorPersonId: string,
  month: string,
): Promise<number> {
  const db = peopleDb();
  const rows = await db
    .selectDistinct({ person_id: workerAllocationProjection.person_id })
    .from(workerAllocationProjection)
    .where(
      and(
        eq(workerAllocationProjection.tenant_id, tenantId),
        eq(workerAllocationProjection.project_id, projectId),
        ne(workerAllocationProjection.person_id, evaluatorPersonId),
        allocationInMonth(month),
      ),
    );
  return rows.length;
}

/** Distinct Team Leads under an AM account (exclude the AM). */
async function countAccountLeadsToScore(
  tenantId: string,
  accountId: string,
  evaluatorPersonId: string,
  month: string,
): Promise<number> {
  const db = peopleDb();
  const rows = await db
    .selectDistinct({ lead_person_id: workerAllocationProjection.lead_person_id })
    .from(workerAllocationProjection)
    .where(
      and(
        eq(workerAllocationProjection.tenant_id, tenantId),
        eq(workerAllocationProjection.account_id, accountId),
        isNotNull(workerAllocationProjection.lead_person_id),
        ne(workerAllocationProjection.lead_person_id, evaluatorPersonId),
        allocationInMonth(month),
      ),
    );
  return rows.length;
}

function buildCardsForCapacity(input: {
  capacity: PerformanceCapacity;
  cycleStatus: CycleStatus;
  totalToScore: number;
}): MonthTaskCard[] {
  const interactive = input.cycleStatus !== 'locked';
  if (!interactive) {
    return [{ kind: 'cycle_locked' }];
  }

  const cards: MonthTaskCard[] = [];
  const { capacity, totalToScore } = input;

  if (capacity.kind === 'tl' || capacity.kind === 'am') {
    // No score rows yet (E2) — everyone in scope is still unscored.
    cards.push({
      kind: 'unscored',
      unscored: totalToScore,
      total: totalToScore,
      interactive: true,
    });
  }

  if (capacity.kind === 'member' || capacity.kind === 'tl') {
    // Self/morale submissions land in later stories — honest not-submitted.
    cards.push(
      { kind: 'self_assessment', submitted: false, interactive: true },
      { kind: 'morale', submitted: false, interactive: true },
    );
  }

  return cards;
}

/**
 * Home to-do list for the Performance month (FUT-695).
 * One group per capacity (dual-role = disjoint groups). Cards are server-authored.
 *
 * Does not call `readPerformanceContext` — that endpoint rejects non-current months,
 * while home may still request cycle classification + tasks for the URL month.
 */
export async function readMonthTasks(
  session: SessionScope,
  input: MonthTasksQuery,
): Promise<MonthTasksResponse> {
  requirePermission(session, 'people.performance.read');

  const at = monthClockNow();
  // Without capacities there is no account in scope, so no manual unlock can apply.
  const lockedStatus = classifyCycleStatus({ month: input.month, at }).status;

  if (!session.person_id) {
    return { month: input.month, cycle_status: lockedStatus, groups: [] };
  }

  const me = session.person_id;
  const db = peopleDb();
  const [p] = await db
    .select({ id: person.id })
    .from(person)
    .where(
      and(eq(person.id, me), eq(person.tenant_id, session.tenant_id), isNull(person.deleted_at)),
    );
  if (!p) {
    return { month: input.month, cycle_status: lockedStatus, groups: [] };
  }

  const capacities = await loadPerformanceCapacities(session, me, input.month);
  // Unlock is per account (FUT-781): the to-do list reopens when any account the
  // caller works on has an unlock window still running.
  const openAccounts = await unlockedAccountIds(
    session,
    input.month,
    capacities.map((c) => c.account_id),
  );
  const { status: cycle_status } = classifyCycleStatus({
    month: input.month,
    at,
    overrideActive: openAccounts.size > 0,
  });
  const groups: MonthTaskGroup[] = [];

  for (const capacity of capacities) {
    let totalToScore = 0;
    if (capacity.kind === 'tl') {
      totalToScore = await countProjectMembersToScore(
        session.tenant_id,
        capacity.project_id,
        me,
        input.month,
      );
    } else if (capacity.kind === 'am') {
      totalToScore = await countAccountLeadsToScore(
        session.tenant_id,
        capacity.account_id,
        me,
        input.month,
      );
    }

    groups.push({
      capacity,
      label: capacityGroupLabel(capacity),
      cards: buildCardsForCapacity({ capacity, cycleStatus: cycle_status, totalToScore }),
    });
  }

  return { month: input.month, cycle_status, groups };
}
