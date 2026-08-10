import type { SessionScope } from '@seta/core';
import { listAccountIdsManagedBy } from '@seta/pm';
import { and, desc, eq } from 'drizzle-orm';
import type { PerformanceConfigGroupView, PerformanceConfigResponse } from '../../contracts.ts';
import { peopleDb } from '../db/client.ts';
import {
  performanceConfigCriterion,
  performanceConfigGroupWeight,
  performanceConfigMonthPin,
  performanceConfigRevision,
  performanceEvaluationGroup,
} from '../db/schema.ts';
import { PeopleError, requirePermission } from '../rbac.ts';
import { ensurePerformanceGroups } from './ensure-performance-groups.ts';
import { classifyCycleStatus, monthClockNow, vnYearMonth } from './month-clock.ts';
import { PERFORMANCE_GROUP_TEMPLATES } from './performance-config-template.ts';
import { loadPerformanceCapacities } from './read-performance-context.ts';

function weightNumber(raw: string | number): number {
  return typeof raw === 'number' ? raw : Number(raw);
}

/**
 * READ authorization for an account's performance config. The managing AM
 * always qualifies; so does any performance participant (TL/member) allocated
 * to a project under the account in the current cycle month — they need the
 * pillar/weight axis to read their own scorecards. Returns `isAm` so callers
 * can gate cycle-affecting side effects (month pin) to the owning AM only.
 */
async function assertCanReadAccountConfig(
  session: SessionScope,
  accountId: string,
): Promise<{ isAm: boolean }> {
  if (!session.person_id) {
    throw new PeopleError('FORBIDDEN', 'No employee record linked to session');
  }
  const managed = await listAccountIdsManagedBy(session.person_id, session.tenant_id);
  if (managed.includes(accountId)) return { isAm: true };

  const capacities = await loadPerformanceCapacities(session, session.person_id, vnYearMonth());
  if (capacities.some((c) => c.account_id === accountId)) return { isAm: false };

  throw new PeopleError('FORBIDDEN', 'Account is not managed by this user', {
    account_id: accountId,
  });
}

async function loadRevisionTree(revisionId: string): Promise<PerformanceConfigGroupView[]> {
  const db = peopleDb();
  const weights = await db
    .select({
      group_id: performanceConfigGroupWeight.group_id,
      weight: performanceConfigGroupWeight.weight,
      code: performanceEvaluationGroup.code,
      name: performanceEvaluationGroup.name,
      sort: performanceEvaluationGroup.sort,
    })
    .from(performanceConfigGroupWeight)
    .innerJoin(
      performanceEvaluationGroup,
      eq(performanceEvaluationGroup.id, performanceConfigGroupWeight.group_id),
    )
    .where(eq(performanceConfigGroupWeight.revision_id, revisionId));

  const criteria = await db
    .select()
    .from(performanceConfigCriterion)
    .where(eq(performanceConfigCriterion.revision_id, revisionId));

  const byGroup = new Map<string, typeof criteria>();
  for (const c of criteria) {
    const list = byGroup.get(c.group_id) ?? [];
    list.push(c);
    byGroup.set(c.group_id, list);
  }

  return weights
    .map((w) => ({
      group_id: w.group_id,
      code: w.code,
      name: w.name,
      sort: w.sort,
      weight: weightNumber(w.weight),
      criteria: (byGroup.get(w.group_id) ?? [])
        .slice()
        .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
        .map((c) => ({
          id: c.id,
          name: c.name,
          weight: weightNumber(c.weight),
          sort: c.sort,
        })),
    }))
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

/** Create revision 1 from the seed template when the account has no config yet. */
export async function ensureAccountConfigRevision1(
  tenantId: string,
  accountId: string,
  createdByUserId: string,
): Promise<{ revision_id: string; revision_no: number }> {
  const db = peopleDb();
  await ensurePerformanceGroups(db, tenantId);

  const [existing] = await db
    .select({
      id: performanceConfigRevision.id,
      revision_no: performanceConfigRevision.revision_no,
    })
    .from(performanceConfigRevision)
    .where(
      and(
        eq(performanceConfigRevision.tenant_id, tenantId),
        eq(performanceConfigRevision.account_id, accountId),
      ),
    )
    .orderBy(desc(performanceConfigRevision.revision_no))
    .limit(1);
  if (existing) return { revision_id: existing.id, revision_no: existing.revision_no };

  const groups = await db
    .select()
    .from(performanceEvaluationGroup)
    .where(eq(performanceEvaluationGroup.tenant_id, tenantId));
  const byCode = new Map(groups.map((g) => [g.code, g]));

  const revisionId = crypto.randomUUID();
  await db.insert(performanceConfigRevision).values({
    id: revisionId,
    tenant_id: tenantId,
    account_id: accountId,
    revision_no: 1,
    created_by_user_id: createdByUserId,
  });

  const weightRows: {
    revision_id: string;
    group_id: string;
    weight: string;
  }[] = [];
  const criterionRows: {
    revision_id: string;
    group_id: string;
    name: string;
    weight: string;
    sort: number;
  }[] = [];

  for (const tmpl of PERFORMANCE_GROUP_TEMPLATES) {
    const g = byCode.get(tmpl.code);
    if (!g) throw new PeopleError('VALIDATION', `Missing seeded group ${tmpl.code}`);
    weightRows.push({
      revision_id: revisionId,
      group_id: g.id,
      weight: tmpl.weight.toFixed(2),
    });
    for (const c of tmpl.criteria) {
      criterionRows.push({
        revision_id: revisionId,
        group_id: g.id,
        name: c.name,
        weight: c.weight.toFixed(2),
        sort: c.sort,
      });
    }
  }

  await db.insert(performanceConfigGroupWeight).values(weightRows);
  await db.insert(performanceConfigCriterion).values(criterionRows);
  return { revision_id: revisionId, revision_no: 1 };
}

function cycleWindowActive(status: string): boolean {
  return status === 'open' || status === 'makeup' || status === 'override';
}

/**
 * Pin head revision for the current VN month when the cycle window is active (AC5).
 * Idempotent — never moves an existing pin.
 */
async function ensureMonthPinIfNeeded(
  tenantId: string,
  accountId: string,
  headRevisionId: string,
): Promise<{ applies_to_next_cycle: boolean }> {
  const at = monthClockNow();
  const month = vnYearMonth(at);
  const { status } = classifyCycleStatus({ month, at });
  if (!cycleWindowActive(status)) {
    return { applies_to_next_cycle: false };
  }

  const db = peopleDb();
  const [pin] = await db
    .select({ revision_id: performanceConfigMonthPin.revision_id })
    .from(performanceConfigMonthPin)
    .where(
      and(
        eq(performanceConfigMonthPin.tenant_id, tenantId),
        eq(performanceConfigMonthPin.account_id, accountId),
        eq(performanceConfigMonthPin.review_month, month),
      ),
    )
    .limit(1);

  if (!pin) {
    await db
      .insert(performanceConfigMonthPin)
      .values({
        tenant_id: tenantId,
        account_id: accountId,
        review_month: month,
        revision_id: headRevisionId,
      })
      .onConflictDoNothing();
  }

  return { applies_to_next_cycle: true };
}

export async function readPerformanceConfig(
  session: SessionScope,
  accountId: string,
): Promise<PerformanceConfigResponse> {
  requirePermission(session, 'people.performance.read');
  const { isAm } = await assertCanReadAccountConfig(session, accountId);

  const head = await ensureAccountConfigRevision1(session.tenant_id, accountId, session.user_id);
  // Pinning the head revision to the cycle month advances cycle state, so only
  // the owning AM triggers it; participants read the same config without side
  // effects (and never see a pin they didn't cause).
  const { applies_to_next_cycle } = isAm
    ? await ensureMonthPinIfNeeded(session.tenant_id, accountId, head.revision_id)
    : { applies_to_next_cycle: false };
  const groups = await loadRevisionTree(head.revision_id);
  return {
    account_id: accountId,
    revision_no: head.revision_no,
    revision_id: head.revision_id,
    applies_to_next_cycle,
    groups,
  };
}
