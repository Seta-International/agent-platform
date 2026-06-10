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

  // Supersede native-suspend chat HITL approvals (staffing.orchestrator runs)
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
       AND r.workflow_id = 'staffing.orchestrator'
       AND a.proposed_payload @> jsonb_build_object('primary', jsonb_build_object('argsPatch', jsonb_build_object('taskId', ${taskId}::text)))
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
