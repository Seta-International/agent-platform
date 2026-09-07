import type { DomainEvent, SubscriberCtx, SubscriberDef } from '@seta/shared-types';
import { sql } from 'drizzle-orm';

interface PlannerTaskAssignedPayload {
  task_id: string;
  user_id: string;
  group_id: string;
  plan_id: string;
}

export async function supersedeStaleAssignApprovals(
  event: DomainEvent<PlannerTaskAssignedPayload>,
  ctx: SubscriberCtx,
): Promise<void> {
  const taskId = event.payload.task_id;
  // The same string the card declared (design D7). Built here rather than
  // interpolated inside the SQL so the format lives in one expression per file.
  const dedupKey = `assign:${taskId}`;

  // Supersede evented workflow (assignBySkill) approvals
  await ctx.tx.execute(sql`
    UPDATE agent.workflow_approvals AS a
       SET status = 'superseded',
           decision_payload = jsonb_build_object(
             'reason', 'task-assigned-elsewhere',
             'eventId', ${event.id}::text
           ),
           decided_at = now()
      FROM agent.workflow_runs AS r
     WHERE a.run_id = r.run_id
       AND r.workflow_id = 'planner.assignBySkill'
       AND r.input_summary @> jsonb_build_object('taskId', ${taskId}::text)
       AND a.status = 'pending'
  `);

  // Supersede every pending chat card that declared THIS task's assign mutex,
  // whichever runtime built it. Keyed on the card's own declaration rather than
  // on r.workflow_id: an A2-authored assign card carries 'planner.action' and
  // was previously never superseded, so it sat pending until the 72-hour
  // sweeper expired it (design §0.3). The evented assignBySkill card declares
  // no dedupKey, so the two statements never touch the same row. No run join is
  // needed any more — the workflow id was the only column it read from there.
  //
  // The legacy singular disjunct is a ONE-RELEASE tolerant read (FUT-840 spec
  // §3.2). Without it a card persisted before the plural rename would stay
  // pending after its task was assigned elsewhere, until the 72-hour sweeper.
  await ctx.tx.execute(sql`
    UPDATE agent.workflow_approvals AS a
       SET status = 'superseded',
           decision_payload = jsonb_build_object(
             'reason', 'task-assigned-elsewhere',
             'eventId', ${event.id}::text
           ),
           decided_at = now()
     WHERE a.tenant_id = ${event.tenantId}::uuid
       AND (
         jsonb_exists(a.proposed_payload -> 'meta' -> 'dedupKeys', ${dedupKey})
         OR a.proposed_payload @> jsonb_build_object(
              'meta', jsonb_build_object('dedupKey', ${dedupKey}::text)
            )
       )
       AND a.status = 'pending'
  `);
}

export function supersedeStaleAssignApprovalsSubscriber(): SubscriberDef<PlannerTaskAssignedPayload> {
  return {
    subscription: 'agent.assign-approvals.supersede',
    event: 'planner.task.assigned',
    eventVersion: 1,
    handler: supersedeStaleAssignApprovals,
  };
}
