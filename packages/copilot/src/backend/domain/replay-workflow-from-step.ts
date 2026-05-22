import type { Mastra } from '@mastra/core';
import { sql } from 'drizzle-orm';
import { copilotDb } from '../../db/index.ts';
import type { SessionLike } from '../types.ts';
import { getWorkflowRun } from './get-workflow-run.ts';

export interface ReplayWorkflowFromStepOpts {
  session: SessionLike;
  runId: string;
  stepId: string;
  payload: Record<string, unknown>;
  mastra: Mastra;
}

export interface ReplayWorkflowFromStepResult {
  newRunId: string;
}

const EXEC_PERM = 'copilot.workflow.run.execute.self';

export async function replayWorkflowFromStep(
  opts: ReplayWorkflowFromStepOpts,
): Promise<ReplayWorkflowFromStepResult> {
  if (!opts.session.effective_permissions.has(EXEC_PERM)) {
    throw Object.assign(new Error(`forbidden: ${EXEC_PERM}`), { code: 'forbidden' });
  }

  const parent = await getWorkflowRun({ session: opts.session, runId: opts.runId });
  if (!parent) {
    throw Object.assign(new Error('not_found'), { code: 'not_found' });
  }

  const workflow = opts.mastra.getWorkflow(parent.workflowId as never);
  const run = await workflow.createRun({ runId: parent.runId } as never);
  await (
    run as unknown as {
      timeTravel: (p: { inputData: unknown; step: string }) => Promise<unknown>;
    }
  ).timeTravel({ inputData: opts.payload, step: opts.stepId });
  const newRunId = run.runId;

  const outboxPayload: Record<string, unknown> = {
    parent_run_id: parent.runId,
    step_id: opts.stepId,
    workflow_id: parent.workflowId,
    tenant_id: parent.tenantId,
    requested_by: opts.session.user_id,
  };
  await copilotDb().execute(sql`
    INSERT INTO core.events (id, tenant_id, aggregate_type, aggregate_id, event_type, event_version, payload)
    VALUES (gen_random_uuid(), ${parent.tenantId}, 'workflow_run', ${newRunId},
            'copilot.workflow.run.replay_requested', 1, ${JSON.stringify(outboxPayload)}::jsonb)
  `);

  return { newRunId };
}
