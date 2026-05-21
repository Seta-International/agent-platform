import type { Mastra } from '@mastra/core';
import { sql } from 'drizzle-orm';
import { copilotDb } from '../../db/index.ts';
import type { SessionLike } from '../routes.ts';
import { getWorkflowRun } from './get-workflow-run.ts';

export interface RerunWorkflowOpts {
  session: SessionLike;
  runId: string;
  inputOverride?: Record<string, unknown>;
  mastra: Mastra;
}

export interface RerunWorkflowResult {
  newRunId: string;
}

export async function rerunWorkflow(opts: RerunWorkflowOpts): Promise<RerunWorkflowResult> {
  if (!opts.session.effective_permissions.has('copilot.workflow.run.execute.self')) {
    throw Object.assign(new Error('forbidden: copilot.workflow.run.execute.self'), {
      code: 'forbidden',
    });
  }

  const parent = await getWorkflowRun({ session: opts.session, runId: opts.runId });
  if (!parent) {
    throw Object.assign(new Error('not_found'), { code: 'not_found' });
  }

  const workflow = opts.mastra.getWorkflow(parent.workflowId as never);
  const inputData: Record<string, unknown> = {
    ...(opts.inputOverride ?? (parent.inputSummary as Record<string, unknown> | null) ?? {}),
    initiatedBy: { user_id: opts.session.user_id, via: 'rerun', parent_run_id: parent.runId },
  };

  const run = await workflow.createRun({});
  await run.start({ inputData });
  const newRunId = run.runId;

  const outboxPayload: Record<string, unknown> = {
    parent_run_id: parent.runId,
    workflow_id: parent.workflowId,
    tenant_id: parent.tenantId,
    requested_by: opts.session.user_id,
  };
  await copilotDb().execute(sql`
    INSERT INTO core.events (id, tenant_id, aggregate_type, aggregate_id, event_type, event_version, payload)
    VALUES (gen_random_uuid(), ${parent.tenantId}, 'workflow_run', ${newRunId},
            'copilot.workflow.run.rerun_requested', 1, ${JSON.stringify(outboxPayload)}::jsonb)
  `);

  return { newRunId };
}
