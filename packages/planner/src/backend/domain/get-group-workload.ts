import type { SessionScope } from '@seta/core';
import { sql } from 'drizzle-orm';
import { plannerDb } from '../db/index.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { groupFilterFor } from '../read-helpers.ts';

export interface GetGroupWorkloadOpts {
  group_id: string;
  session: SessionScope;
}

export interface WorkloadRow {
  userId: string;
  displayName: string;
  openTaskCount: number;
}

export interface GetGroupWorkloadResult {
  rows: WorkloadRow[];
}

export async function getGroupWorkload(
  opts: GetGroupWorkloadOpts,
): Promise<GetGroupWorkloadResult> {
  await requirePermission(opts.session, 'planner.reporting.read', opts.group_id);

  const groupFilter = await groupFilterFor(opts.session);
  if (groupFilter !== null && !groupFilter.includes(opts.group_id)) {
    throw new PlannerError('FORBIDDEN', 'No access to group', { group_id: opts.group_id });
  }

  const db = plannerDb();

  const result = await db.execute(sql`
    SELECT ta.user_id,
           COALESCE(ap.display_name, ta.user_id::text) AS display_name,
           COUNT(*)::int AS open_task_count
    FROM planner.task_assignments ta
    JOIN planner.tasks t ON t.id = ta.task_id
    JOIN planner.plans p ON p.id = t.plan_id
    LEFT JOIN planner.assignee_projection ap ON ap.user_id = ta.user_id
    WHERE ta.tenant_id = ${opts.session.tenant_id}::uuid
      AND p.group_id = ${opts.group_id}::uuid
      AND t.deleted_at IS NULL
      AND t.is_deferred = false
      AND t.progress <> 'done'
    GROUP BY ta.user_id, ap.display_name
    ORDER BY open_task_count DESC
  `);

  const rows = (result.rows as Record<string, unknown>[]).map((r) => ({
    userId: r.user_id as string,
    displayName: r.display_name as string,
    openTaskCount: r.open_task_count as number,
  }));

  return { rows };
}
