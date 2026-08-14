import { sql } from 'drizzle-orm';
import { agentDb } from '../db/index.ts';

const ASSIGN_BY_SKILL_MASTRA_ID = 'planner.assignBySkill';
const ASSIGNMENT_ORCHESTRATOR_ID = 'planner.assignment-orchestrator';

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
 *   • Native-suspend `planner.assignment-orchestrator` runs — write-chat-approval-row.ts
 *     stores the taskId in both `input_summary` and the approval's
 *     `proposed_payload`. We match via the approval JOIN so the row is only a
 *     mutex hit once its approval card is readable.
 *   • Any chat card that DECLARED the assign mutex in `meta.dedupKeys`, whichever
 *     runtime built it (design D7). An A2-authored assign card carries
 *     'planner.action', so the workflow-id branches above would miss it and two
 *     people could be proposed for one task at once. Keyed on the card's own
 *     declaration; the branch above stays for cards written before FUT-822.
 *
 *     The legacy `meta.dedupKey` disjunct is a ONE-RELEASE tolerant read
 *     (FUT-840 spec §3.2): a card persisted before the plural rename would
 *     otherwise fall out of this lookup, making a second assignment proposal for
 *     that task possible. Delete it once no pending row can carry the singular
 *     field — bounded by the 72-hour approval TTL.
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
       WHERE r.workflow_id = ${ASSIGNMENT_ORCHESTRATOR_ID}
         AND r.status IN ('running', 'paused')
         AND r.tenant_id = ${opts.tenantId}
         AND a.status = 'pending'
         AND a.proposed_payload @> jsonb_build_object('primary', jsonb_build_object('argsPatch', jsonb_build_object('taskId', ${opts.taskId}::text)))
      UNION ALL
      SELECT r.run_id, r.started_at
        FROM agent.workflow_runs r
        JOIN agent.workflow_approvals a ON a.run_id = r.run_id
       WHERE r.status IN ('running', 'paused')
         AND r.tenant_id = ${opts.tenantId}
         AND a.status = 'pending'
         AND (
           jsonb_exists(a.proposed_payload -> 'meta' -> 'dedupKeys', ${`assign:${opts.taskId}`})
           OR a.proposed_payload @> jsonb_build_object('meta', jsonb_build_object('dedupKey', ${`assign:${opts.taskId}`}::text))
         )
    ) candidates
    ORDER BY started_at DESC
    LIMIT 1
  `);
  const rows = result.rows as unknown as Array<{ run_id: string }>;
  return rows[0]?.run_id ?? null;
}
