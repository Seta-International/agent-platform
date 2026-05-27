import { sql } from 'drizzle-orm';
import { agentDb } from '../db/index.ts';

const ASSIGN_BY_SKILL_MASTRA_ID = 'planner.assignBySkill';

export interface GetPendingAssignRunIdForTaskOpts {
  taskId: string;
  tenantId: string;
}

export async function getPendingAssignRunIdForTask(
  opts: GetPendingAssignRunIdForTaskOpts,
): Promise<string | null> {
  const db = agentDb();
  // Include `running` as well as `paused`: a run that's mid-compute is still
  // user-visible work in progress and should surface the "Suggest in progress
  // — view" link on the task card; otherwise the toast is the only entry point.
  const result = await db.execute(sql`
    SELECT run_id
      FROM agent.workflow_runs
     WHERE workflow_id = ${ASSIGN_BY_SKILL_MASTRA_ID}
       AND status IN ('running', 'paused')
       AND tenant_id = ${opts.tenantId}
       AND input_summary @> jsonb_build_object('taskId', ${opts.taskId}::text)
     ORDER BY started_at DESC
     LIMIT 1
  `);
  const rows = result.rows as unknown as Array<{ run_id: string }>;
  return rows[0]?.run_id ?? null;
}
