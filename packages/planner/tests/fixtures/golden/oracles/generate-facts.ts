// packages/planner/tests/fixtures/golden/oracles/generate-facts.ts
//
// Independent SQL fact oracle (spec §C). Re-derives the ground-truth facts the
// eval asserts against, using RAW SQL ONLY — it must never import an agent tool
// or the domain read layer, so a bug in those cannot mask itself in the oracle.
// The independence guard (oracle-independence.test.ts) enforces that.
import type { Pool } from 'pg';
import { REFERENCE_TIME, TENANT_ID } from '../constants.ts';

export interface GoldenUserFacts {
  openTaskCount: number;
  groups: string[];
  inaccessibleGroups: string[];
}

export interface GoldenTaskFacts {
  commentCount: number;
  activityCount: number;
  groupId: string | null;
  tenantId: string;
}

export interface GoldenFacts {
  datasetVersion: string;
  referenceTime: string;
  facts: {
    users: Record<string, GoldenUserFacts>;
    tasks: Record<string, GoldenTaskFacts>;
  };
}

/**
 * Derives the golden facts for the MAIN tenant straight from the seeded DB.
 * "Open" = a non-deleted task whose progress is not 'done' (matches the seed's
 * progress enum and the smoke test's open-task definition).
 */
export async function generateGoldenFacts(pool: Pool): Promise<GoldenFacts> {
  const users: Record<string, GoldenUserFacts> = {};
  const tasks: Record<string, GoldenTaskFacts> = {};

  const ensureUser = (userId: string): GoldenUserFacts =>
    (users[userId] ??= { openTaskCount: 0, groups: [], inaccessibleGroups: [] });

  // Open-task counts per assignee.
  const open = await pool.query(
    `SELECT ta.user_id, COUNT(*)::int AS open_count
       FROM planner.tasks t
       JOIN planner.task_assignments ta ON ta.task_id = t.id
      WHERE t.tenant_id = $1 AND t.progress <> 'done' AND t.deleted_at IS NULL
      GROUP BY ta.user_id`,
    [TENANT_ID],
  );
  for (const r of open.rows as { user_id: string; open_count: number }[]) {
    ensureUser(r.user_id).openTaskCount = r.open_count;
  }

  // Group access (accessible vs inaccessible) per member.
  const allGroups = await pool.query(`SELECT id FROM planner.groups WHERE tenant_id = $1`, [
    TENANT_ID,
  ]);
  const allGroupIds = (allGroups.rows as { id: string }[]).map((r) => r.id).sort();
  const members = await pool.query(
    `SELECT user_id, group_id FROM planner.group_members WHERE tenant_id = $1`,
    [TENANT_ID],
  );
  const groupsByUser = new Map<string, Set<string>>();
  for (const r of members.rows as { user_id: string; group_id: string }[]) {
    const set = groupsByUser.get(r.user_id) ?? new Set<string>();
    set.add(r.group_id);
    groupsByUser.set(r.user_id, set);
  }
  for (const [userId, gids] of groupsByUser) {
    const u = ensureUser(userId);
    u.groups = [...gids].sort();
    u.inaccessibleGroups = allGroupIds.filter((g) => !gids.has(g));
  }

  // Per-task comment count, activity-event count, owning group.
  const taskRows = await pool.query(
    `SELECT t.id, t.tenant_id, p.group_id,
        (SELECT COUNT(*)::int FROM planner.task_comments c WHERE c.task_id = t.id) AS comment_count,
        (SELECT COUNT(*)::int FROM core.events e
           WHERE e.tenant_id = t.tenant_id AND (
             (e.aggregate_type = 'planner.task' AND e.aggregate_id = t.id::text)
             OR (e.aggregate_type IN ('planner.comment', 'planner.label')
                 AND e.payload->>'task_id' = t.id::text))) AS activity_count
       FROM planner.tasks t
       JOIN planner.plans p ON p.id = t.plan_id
      WHERE t.tenant_id = $1 AND t.deleted_at IS NULL`,
    [TENANT_ID],
  );
  for (const r of taskRows.rows as {
    id: string;
    tenant_id: string;
    group_id: string | null;
    comment_count: number;
    activity_count: number;
  }[]) {
    tasks[r.id] = {
      commentCount: r.comment_count,
      activityCount: r.activity_count,
      groupId: r.group_id,
      tenantId: r.tenant_id,
    };
  }

  return {
    datasetVersion: '2.0.0',
    referenceTime: REFERENCE_TIME.toISOString(),
    facts: { users, tasks },
  };
}
