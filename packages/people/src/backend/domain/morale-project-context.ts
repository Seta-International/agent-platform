import { and, eq, or, sql } from 'drizzle-orm';
import type { MoraleSenderCapacity } from '../../contracts.ts';
import { peopleDb } from '../db/client.ts';
import { projectProjection, workerAllocationProjection } from '../db/schema.ts';

export interface MoraleProjectContext {
  project_id: string;
  project_name: string | null;
  account_id: string;
  capacity: MoraleSenderCapacity;
}

/**
 * The delivery context a morale note is filed under, for the project the sender chose.
 *
 * *Which* project that is has already been settled by `resolveMoraleRecipients` (FUT-782):
 * the sender's only project when they hold one, their own pick when they hold several,
 * and none at all when they hold none. This resolves the rest of the snapshot the
 * recipients' inbox needs — name, account, and the capacity the sender wrote in — because
 * a note is grouped by project and people move between projects, so deriving any of it at
 * read time would silently re-file notes someone has already read.
 *
 * Null for `projectId: null`: an HR or BoD manager with no allocation files against no
 * project, and their notes group under "No project" rather than being hidden.
 *
 * Several rows can describe one person on one project — a re-allocation, or delivering on
 * a project they also lead. The sender's own allocation outranks a lead-only row, because
 * `planned_pct` describes the former and is meaningless for the latter; the rest of the
 * ordering only makes the pick stable rather than whatever the planner returns first.
 */
export async function resolveSenderProjectContext(
  tenantId: string,
  personId: string,
  projectId: string | null,
): Promise<MoraleProjectContext | null> {
  if (!projectId) return null;

  const rows = await peopleDb()
    .select({
      project_id: workerAllocationProjection.project_id,
      account_id: workerAllocationProjection.account_id,
      lead_person_id: workerAllocationProjection.lead_person_id,
      project_name: projectProjection.name,
    })
    .from(workerAllocationProjection)
    .leftJoin(
      projectProjection,
      eq(projectProjection.project_id, workerAllocationProjection.project_id),
    )
    .where(
      and(
        eq(workerAllocationProjection.tenant_id, tenantId),
        eq(workerAllocationProjection.project_id, projectId),
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
    );

  const winner = rows.at(0);
  // Not an error: the caller only reaches here with a project the sender demonstrably
  // sits on, so an empty result means the allocation was withdrawn mid-submit. The note
  // still stands — it files under no project rather than being refused at the last step.
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
