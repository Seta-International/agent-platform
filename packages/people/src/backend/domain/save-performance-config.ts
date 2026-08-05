import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { listAccountIdsManagedBy } from '@seta/pm';
import { and, desc, eq } from 'drizzle-orm';
import type { SavePerformanceConfigInput, SavePerformanceConfigResponse } from '../../contracts.ts';
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
import { ensureAccountConfigRevision1 } from './read-performance-config.ts';

function cents(n: number): number {
  return Math.round(n * 100);
}

function cycleWindowActive(status: string): boolean {
  return status === 'open' || status === 'makeup' || status === 'override';
}

async function assertAmOwnsAccount(session: SessionScope, accountId: string): Promise<void> {
  if (!session.person_id) {
    throw new PeopleError('FORBIDDEN', 'No employee record linked to session');
  }
  const managed = await listAccountIdsManagedBy(session.person_id, session.tenant_id);
  if (!managed.includes(accountId)) {
    throw new PeopleError('FORBIDDEN', 'Account is not managed by this user', {
      account_id: accountId,
    });
  }
}

function validateWeights(input: SavePerformanceConfigInput, expectedGroupIds: Set<string>): void {
  if (input.groups.length !== expectedGroupIds.size) {
    throw new PeopleError('VALIDATION', 'Must include every evaluation group exactly once');
  }
  const seen = new Set<string>();
  let groupSum = 0;
  for (const g of input.groups) {
    if (!expectedGroupIds.has(g.group_id)) {
      throw new PeopleError('VALIDATION', `Unknown group_id ${g.group_id}`);
    }
    if (seen.has(g.group_id)) {
      throw new PeopleError('VALIDATION', `Duplicate group_id ${g.group_id}`);
    }
    seen.add(g.group_id);
    groupSum += cents(g.weight);

    const names = new Set<string>();
    let critSum = 0;
    for (const c of g.criteria) {
      const key = c.name.trim().toLowerCase();
      if (names.has(key)) {
        throw new PeopleError('VALIDATION', `Duplicate criterion name in group: ${c.name}`);
      }
      names.add(key);
      critSum += cents(c.weight);
    }
    if (critSum !== cents(g.weight)) {
      throw new PeopleError(
        'VALIDATION',
        `Criteria weights must equal group weight for group ${g.group_id}`,
        { group_id: g.group_id, group_weight: g.weight, criteria_sum: critSum / 100 },
      );
    }
  }
  if (groupSum !== 10_000) {
    throw new PeopleError('VALIDATION', 'Group weights must total 100%', {
      total: groupSum / 100,
    });
  }
}

export async function savePerformanceConfig(
  session: SessionScope,
  input: SavePerformanceConfigInput,
): Promise<SavePerformanceConfigResponse> {
  requirePermission(session, 'people.performance.configure');
  await assertAmOwnsAccount(session, input.account_id);

  const db = peopleDb();
  await ensurePerformanceGroups(db, session.tenant_id);

  // Ensure r1 exists so base_revision_no is meaningful.
  await ensureAccountConfigRevision1(session.tenant_id, input.account_id, session.user_id);

  const groups = await db
    .select({ id: performanceEvaluationGroup.id })
    .from(performanceEvaluationGroup)
    .where(eq(performanceEvaluationGroup.tenant_id, session.tenant_id));
  validateWeights(input, new Set(groups.map((g) => g.id)));

  const [head] = await db
    .select({
      id: performanceConfigRevision.id,
      revision_no: performanceConfigRevision.revision_no,
    })
    .from(performanceConfigRevision)
    .where(
      and(
        eq(performanceConfigRevision.tenant_id, session.tenant_id),
        eq(performanceConfigRevision.account_id, input.account_id),
      ),
    )
    .orderBy(desc(performanceConfigRevision.revision_no))
    .limit(1);

  if (!head || head.revision_no !== input.base_revision_no) {
    throw new PeopleError('CONFLICT', 'base_revision_no mismatch — reload and try again', {
      current_revision_no: head?.revision_no ?? null,
      base_revision_no: input.base_revision_no,
    });
  }

  const nextNo = head.revision_no + 1;
  const revisionId = crypto.randomUUID();

  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      // Re-check head inside tx (optimistic lock).
      const [locked] = await tx
        .select({ revision_no: performanceConfigRevision.revision_no })
        .from(performanceConfigRevision)
        .where(
          and(
            eq(performanceConfigRevision.tenant_id, session.tenant_id),
            eq(performanceConfigRevision.account_id, input.account_id),
          ),
        )
        .orderBy(desc(performanceConfigRevision.revision_no))
        .limit(1);
      if (!locked || locked.revision_no !== input.base_revision_no) {
        throw new PeopleError('CONFLICT', 'base_revision_no mismatch — reload and try again', {
          current_revision_no: locked?.revision_no ?? null,
        });
      }

      await tx.insert(performanceConfigRevision).values({
        id: revisionId,
        tenant_id: session.tenant_id,
        account_id: input.account_id,
        revision_no: nextNo,
        created_by_user_id: session.user_id,
      });

      await tx.insert(performanceConfigGroupWeight).values(
        input.groups.map((g) => ({
          revision_id: revisionId,
          group_id: g.group_id,
          weight: g.weight.toFixed(2),
        })),
      );

      await tx.insert(performanceConfigCriterion).values(
        input.groups.flatMap((g) =>
          g.criteria.map((c, idx) => ({
            revision_id: revisionId,
            group_id: g.group_id,
            name: c.name.trim(),
            weight: c.weight.toFixed(2),
            sort: c.sort ?? idx,
          })),
        ),
      );

      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'people.performance_config',
        aggregateId: input.account_id,
        eventType: 'people.performance.config.saved',
        eventVersion: 1,
        payload: {
          account_id: input.account_id,
          revision_id: revisionId,
          revision_no: nextNo,
          base_revision_no: input.base_revision_no,
        },
      });
    },
  );

  // AC5: do not move an existing pin; ensure pin exists if window open (first touch).
  const at = monthClockNow();
  const month = vnYearMonth(at);
  const { status } = classifyCycleStatus({ month, at });
  let applies_to_next_cycle = false;
  if (cycleWindowActive(status)) {
    const [pin] = await db
      .select({ revision_id: performanceConfigMonthPin.revision_id })
      .from(performanceConfigMonthPin)
      .where(
        and(
          eq(performanceConfigMonthPin.tenant_id, session.tenant_id),
          eq(performanceConfigMonthPin.account_id, input.account_id),
          eq(performanceConfigMonthPin.review_month, month),
        ),
      )
      .limit(1);
    if (!pin) {
      // Pin the previous head (config in force for this cycle), not the new revision.
      await db
        .insert(performanceConfigMonthPin)
        .values({
          tenant_id: session.tenant_id,
          account_id: input.account_id,
          review_month: month,
          revision_id: head.id,
        })
        .onConflictDoNothing();
    }
    applies_to_next_cycle = true;
  }

  return { revision_no: nextNo, revision_id: revisionId, applies_to_next_cycle };
}
