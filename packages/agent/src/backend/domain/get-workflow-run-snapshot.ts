import type { Mastra } from '@mastra/core';
import type { SessionLike } from '../types.ts';
import { getWorkflowRun } from './get-workflow-run.ts';

export interface GetWorkflowRunSnapshotOpts {
  session: SessionLike;
  runId: string;
  mastra: Mastra;
}

/** Merge descriptions from the live workflow definition into a stored snapshot's
 *  serializedStepGraph so nodes show descriptions even on older runs. */
function enrichSnapshotDescriptions(
  snapshot: Record<string, unknown>,
  mastra: Mastra,
  workflowId: string,
): Record<string, unknown> {
  const stepGraph = snapshot.serializedStepGraph;
  if (!Array.isArray(stepGraph) || stepGraph.length === 0) return snapshot;

  let workflow: { serializedStepGraph?: unknown[] } | undefined;
  try {
    const w = (mastra as Mastra).getWorkflow(workflowId);
    workflow = w as typeof workflow;
  } catch {
    return snapshot;
  }
  const liveGraph = workflow?.serializedStepGraph;
  if (!Array.isArray(liveGraph)) return snapshot;

  // Build a flat map of stepId → description from the live graph.
  const descMap = new Map<string, string>();
  function collectDescs(steps: unknown[]): void {
    for (const s of steps) {
      if (!s || typeof s !== 'object') continue;
      const step = s as Record<string, unknown>;
      if (step.type === 'step') {
        const inner = step.step as Record<string, unknown> | undefined;
        if (inner?.id && inner.description) {
          descMap.set(String(inner.id), String(inner.description));
        }
      }
      // Recurse into branches/children.
      for (const key of ['steps', 'branches']) {
        const children = step[key];
        if (Array.isArray(children)) collectDescs(children);
      }
      if (step.step && typeof step.step === 'object' && 'type' in (step.step as object)) {
        collectDescs([step.step]);
      }
    }
  }
  collectDescs(liveGraph);
  if (descMap.size === 0) return snapshot;

  // Overlay descriptions into the stored graph.
  function overlayDescs(steps: unknown[]): unknown[] {
    return steps.map((s) => {
      if (!s || typeof s !== 'object') return s;
      const step = s as Record<string, unknown>;
      if (step.type === 'step') {
        const inner = step.step as Record<string, unknown> | undefined;
        if (inner?.id) {
          const desc = descMap.get(String(inner.id));
          if (desc && !inner.description) {
            return { ...step, step: { ...inner, description: desc } };
          }
        }
      }
      const updated: Record<string, unknown> = { ...step };
      for (const key of ['steps', 'branches']) {
        if (Array.isArray(step[key])) updated[key] = overlayDescs(step[key] as unknown[]);
      }
      if (step.step && typeof step.step === 'object' && 'type' in (step.step as object)) {
        const [enriched] = overlayDescs([step.step]);
        updated.step = enriched;
      }
      return updated;
    });
  }

  return { ...snapshot, serializedStepGraph: overlayDescs(stepGraph) };
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

  // workflow_runs.workflow_id stores Mastra's intrinsic workflow id, which is
  // also the key Mastra's snapshot storage uses (`mastra_workflow_snapshot.workflow_name`).
  const snapshot = await workflowsStore.loadWorkflowSnapshot({
    workflowName: projection.workflowId,
    runId: opts.runId,
  });
  if (!snapshot) return null;

  return enrichSnapshotDescriptions(
    snapshot as unknown as Record<string, unknown>,
    opts.mastra,
    projection.workflowId,
  );
}
