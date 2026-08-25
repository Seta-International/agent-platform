import { and, eq, or, sql } from 'drizzle-orm';
import type { MoraleSenderCapacity } from '../../contracts.ts';
import { peopleDb } from '../db/client.ts';
import { projectProjection, workerAllocationProjection } from '../db/schema.ts';

export interface MoralePrimaryProject {
  project_id: string;
  project_name: string | null;
  account_id: string;
  capacity: MoraleSenderCapacity;
}

/**
 * The one project a morale note is filed under (FUT-786).
 *
 * A note is about a person, not a project, so nothing in the domain forces a single
 * answer — but the recipients' inbox groups by project, and a note that appeared under
 * every project its author touches would make the per-project totals add up to more
 * than the inbox's own total. So one is chosen here, once, at submit time.
 *
 * The rule is "where this person mostly works": the allocation they hold the largest
 * share of, ties broken by the most recently started one and then by project name so the
 * choice is stable rather than whatever the planner happens to return first. Leading a
 * project counts only when the sender has no allocation of their own — a lead who also
 * delivers on a different team writes from the team they deliver on.
 *
 * Null for someone with no active allocation at all; their notes group under "No project"
 * rather than being hidden.
 */
export async function resolvePrimaryProject(
  tenantId: string,
  personId: string,
): Promise<MoralePrimaryProject | null> {
  const rows = await peopleDb()
    .select({
      project_id: workerAllocationProjection.project_id,
      account_id: workerAllocationProjection.account_id,
      lead_person_id: workerAllocationProjection.lead_person_id,
      planned_pct: workerAllocationProjection.planned_pct,
      date_from: workerAllocationProjection.date_from,
      project_name: projectProjection.name,
      // Allocations where the sender is the worker outrank ones where they are only the
      // project's lead: `planned_pct` describes the former and is meaningless for the
      // latter, so mixing the two would compare a real share against a null.
      is_member: sql<boolean>`${workerAllocationProjection.person_id} = ${personId}`.as(
        'is_member',
      ),
    })
    .from(workerAllocationProjection)
    .leftJoin(
      projectProjection,
      eq(projectProjection.project_id, workerAllocationProjection.project_id),
    )
    .where(
      and(
        eq(workerAllocationProjection.tenant_id, tenantId),
        eq(workerAllocationProjection.active, true),
        or(
          eq(workerAllocationProjection.person_id, personId),
          eq(workerAllocationProjection.lead_person_id, personId),
        ),
      ),
    )
    .orderBy(
      sql`(${workerAllocationProjection.person_id} = ${personId}) DESC`,
      sql`${workerAllocationProjection.planned_pct} DESC NULLS LAST`,
      sql`${workerAllocationProjection.date_from} DESC NULLS LAST`,
      sql`${projectProjection.name} ASC NULLS LAST`,
      workerAllocationProjection.project_id,
    );

  const winner = rows.at(0);
  if (!winner) return null;

  return {
    project_id: winner.project_id,
    project_name: winner.project_name,
    account_id: winner.account_id,
    // Leading the project you deliver on makes you its TL here, the same way capacity is
    // read from live allocations everywhere else in Morale rather than from a role grant.
    capacity: winner.lead_person_id === personId ? 'tl' : 'member',
  };
}
