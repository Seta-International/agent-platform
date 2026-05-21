import type { Mastra } from '@mastra/core';
import type { SessionLike } from '../routes.ts';
import { getWorkflowRun } from './get-workflow-run.ts';

export interface GetWorkflowRunSnapshotOpts {
  session: SessionLike;
  runId: string;
  mastra: Mastra;
}

export async function getWorkflowRunSnapshot(
  opts: GetWorkflowRunSnapshotOpts,
): Promise<unknown | null> {
  const projection = await getWorkflowRun({ session: opts.session, runId: opts.runId });
  if (!projection) return null;

  const storage = opts.mastra.getStorage();
  if (!storage) return null;

  const workflowsStore = await storage.getStore('workflows');
  if (!workflowsStore) return null;

  const snapshot = await workflowsStore.loadWorkflowSnapshot({
    workflowName: projection.workflowId,
    runId: opts.runId,
  });
  return snapshot ?? null;
}
