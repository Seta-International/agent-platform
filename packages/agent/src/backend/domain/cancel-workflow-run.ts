import type { Mastra } from '@mastra/core';
import type { SessionLike } from '../types.ts';
import { getWorkflowRun } from './get-workflow-run.ts';
import { resolveRunPermissionScope } from './workflow-run-scope.ts';

export interface CancelWorkflowRunOpts {
  session: SessionLike;
  runId: string;
  mastra: Mastra;
}

export async function cancelWorkflowRun(opts: CancelWorkflowRunOpts): Promise<void> {
  const scope = resolveRunPermissionScope(opts.session, 'agent.workflow.run.cancel');
  if (scope.kind === 'none') {
    throw Object.assign(new Error('forbidden: agent.workflow.run.cancel'), { code: 'forbidden' });
  }

  const run = await getWorkflowRun({ session: opts.session, runId: opts.runId });
  if (!run) {
    throw Object.assign(new Error('not_found'), { code: 'not_found' });
  }

  const ownsRun = run.startedBy === opts.session.user_id;
  const canCancelAny = scope.kind === 'tenant';
  if (!ownsRun && !canCancelAny) {
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
