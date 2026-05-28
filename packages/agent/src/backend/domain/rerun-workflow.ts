import type { Mastra } from '@mastra/core';
import type { RequestContext } from '@mastra/core/request-context';
import { sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import { agentDb } from '../db/index.ts';
import type { SessionLike } from '../types.ts';
import { onLifecycleEvent } from '../workflows/_infra/lifecycle-hook.ts';
import { getWorkflowRun } from './get-workflow-run.ts';

export interface RerunWorkflowOpts {
  session: SessionLike;
  runId: string;
  inputOverride?: Record<string, unknown>;
  mastra: Mastra;
  requestContext: RequestContext;
  pool: Pool;
}

export interface RerunWorkflowResult {
  newRunId: string;
}

export async function rerunWorkflow(opts: RerunWorkflowOpts): Promise<RerunWorkflowResult> {
  if (!opts.session.effective_permissions.has('agent.workflow.run.execute.self')) {
    throw Object.assign(new Error('forbidden: agent.workflow.run.execute.self'), {
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
  // Eagerly project the run-started row so the client can fetch the run
  // immediately after we return newRunId, regardless of async pubsub timing.
  await onLifecycleEvent(opts.pool, {
    kind: 'run-started',
    runId: run.runId,
    eventSeq: -1,
    workflowId:
      typeof (workflow as { id?: unknown }).id === 'string'
        ? (workflow as { id: string }).id
        : parent.workflowId,
    tenantId: parent.tenantId,
    startedBy: opts.session.user_id,
    startedVia: 'rerun',
    parentThreadId: null,
    parentRunId: parent.runId,
    sourceEventId: null,
    inputSummary: inputData,
    occurredAt: new Date(),
  });
  void (run.start({ inputData, requestContext: opts.requestContext } as never) as Promise<unknown>);
  const newRunId = run.runId;

  const outboxPayload: Record<string, unknown> = {
    parent_run_id: parent.runId,
    workflow_id: parent.workflowId,
    tenant_id: parent.tenantId,
    requested_by: opts.session.user_id,
  };
  await agentDb().execute(sql`
    INSERT INTO core.events (id, tenant_id, aggregate_type, aggregate_id, event_type, event_version, payload)
    VALUES (gen_random_uuid(), ${parent.tenantId}, 'workflow_run', ${newRunId},
            'agent.workflow.run.rerun_requested', 1, ${JSON.stringify(outboxPayload)}::jsonb)
  `);

  return { newRunId };
}
