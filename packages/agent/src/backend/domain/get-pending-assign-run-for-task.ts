import { sql } from 'drizzle-orm';
import { agentDb } from '../db/index.ts';

const ASSIGN_BY_SKILL_MASTRA_ID = 'planner.assignBySkill';
const CHAT_HITL_PROPOSE_ID = '__chat_hitl:planner_proposeAssignment';

export interface GetPendingAssignRunIdForTaskOpts {
  taskId: string;
  tenantId: string;
}

/**
 * Returns the runId of an in-flight assignment proposal for `taskId`, if any.
 *
 * Two shapes coexist for a "pending assignment":
 *   • Evented `planner.assignBySkill` runs — the taskId lives in
 *     `workflow_runs.input_summary`. The row is inserted synchronously by
 *     the /start route; the approval row only lands later when the workflow
 *     reaches its HITL suspend step, so we MUST NOT require the approval row
 *     here (else the assignees-card button stays as "Suggest" until the
 *     workflow has suspended, and a second click silently spawns a duplicate
 *     run).
 *   • Chat-flow `__chat_hitl:planner_proposeAssignment` runs — the synthetic
 *     workflow_runs row carries `{tool_id, thread_id}` only, so the taskId is
 *     reachable only through `workflow_approvals.proposed_payload`. Both rows
 *     are inserted atomically by insert-chat-hitl-approval.ts, so the JOIN
 *     is correct (and the approval is necessary as the taskId carrier).
 */
export async function getPendingAssignRunIdForTask(
  opts: GetPendingAssignRunIdForTaskOpts,
): Promise<string | null> {
  const db = agentDb();
  const result = await db.execute(sql`
    SELECT run_id FROM (
      SELECT r.run_id, r.started_at
        FROM agent.workflow_runs r
       WHERE r.workflow_id = ${ASSIGN_BY_SKILL_MASTRA_ID}
         AND r.status IN ('running', 'paused')
         AND r.tenant_id = ${opts.tenantId}
         AND r.input_summary @> jsonb_build_object('taskId', ${opts.taskId}::text)
      UNION ALL
      SELECT r.run_id, r.started_at
        FROM agent.workflow_runs r
        JOIN agent.workflow_approvals a ON a.run_id = r.run_id
       WHERE r.workflow_id = ${CHAT_HITL_PROPOSE_ID}
         AND r.status IN ('running', 'paused')
         AND r.tenant_id = ${opts.tenantId}
         AND a.status = 'pending'
         AND a.proposed_payload @> jsonb_build_object('primary', jsonb_build_object('argsPatch', jsonb_build_object('taskId', ${opts.taskId}::text)))
    ) candidates
    ORDER BY started_at DESC
    LIMIT 1
  `);
  const rows = result.rows as unknown as Array<{ run_id: string }>;
  return rows[0]?.run_id ?? null;
}
