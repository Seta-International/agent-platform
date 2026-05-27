import type { Mastra } from '@mastra/core';
import type { SessionLike } from '../types.ts';
import { getWorkflowRun } from './get-workflow-run.ts';

export interface CancelWorkflowRunOpts {
  session: SessionLike;
  runId: string;
  mastra: Mastra;
}

const SELF = 'agent.workflow.run.cancel.self';
const TENANT = 'agent.workflow.run.cancel.tenant';
const INSTANCE = 'agent.workflow.run.cancel.instance';

export async function cancelWorkflowRun(opts: CancelWorkflowRunOpts): Promise<void> {
  const perms = opts.session.effective_permissions;
  if (!perms.has(SELF) && !perms.has(TENANT) && !perms.has(INSTANCE)) {
    throw Object.assign(new Error('forbidden: cancel requires agent.workflow.run.cancel.*'), {
      code: 'forbidden',
    });
  }

  const run = await getWorkflowRun({ session: opts.session, runId: opts.runId });
  if (!run) {
    throw Object.assign(new Error('not_found'), { code: 'not_found' });
  }

  const ownsRun = run.startedBy === opts.session.user_id;
  if (!ownsRun && !perms.has(TENANT) && !perms.has(INSTANCE)) {
    throw Object.assign(new Error("forbidden: cannot cancel another user's run"), {
      code: 'forbidden',
    });
  }

  if (run.status !== 'running' && run.status !== 'paused') {
    return;
  }

  await (
    opts.mastra as unknown as {
      pubsub: { publish: (channel: string, evt: Record<string, unknown>) => Promise<void> };
    }
  ).pubsub.publish('workflows', {
    type: 'workflow.cancel',
    runId: opts.runId,
    data: { tenantId: run.tenantId, workflowId: run.workflowId, durationMs: 0 },
  });
}
