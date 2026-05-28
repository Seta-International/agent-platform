import { sql } from 'drizzle-orm';
import { agentDb } from '../db/index.ts';

const ASSIGN_BY_SKILL_MASTRA_ID = 'planner.assignBySkill';
const CHAT_HITL_PROPOSE_ID = '__chat_hitl:planner_proposeAssignment';

export interface GetPendingAssignRunIdForTaskOpts {
  taskId: string;
  tenantId: string;
}

export async function getPendingAssignRunIdForTask(
  opts: GetPendingAssignRunIdForTaskOpts,
): Promise<string | null> {
  const db = agentDb();
  // Check both evented workflow runs (assignBySkill) AND chat-flow HITL
  // proposals (__chat_hitl:planner_proposeAssignment). This prevents
  // concurrent proposals for the same task across threads/paths.
  const result = await db.execute(sql`
    SELECT r.run_id
      FROM agent.workflow_runs r
      JOIN agent.workflow_approvals a ON a.run_id = r.run_id
     WHERE r.workflow_id IN (${ASSIGN_BY_SKILL_MASTRA_ID}, ${CHAT_HITL_PROPOSE_ID})
       AND r.status IN ('running', 'paused')
       AND r.tenant_id = ${opts.tenantId}
       AND a.status = 'pending'
       AND (
         r.input_summary @> jsonb_build_object('taskId', ${opts.taskId}::text)
         OR a.proposed_payload @> jsonb_build_object('primary', jsonb_build_object('argsPatch', jsonb_build_object('taskId', ${opts.taskId}::text)))
       )
     ORDER BY r.started_at DESC
     LIMIT 1
  `);
  const rows = result.rows as unknown as Array<{ run_id: string }>;
  return rows[0]?.run_id ?? null;
}
