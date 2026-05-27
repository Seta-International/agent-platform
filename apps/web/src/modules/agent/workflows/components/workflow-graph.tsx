import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import { useEffect, useMemo, useState } from 'react';
import { workflowsApi } from '../api/workflows.ts';
import { buildWorkflowGraph } from '../lib/build-graph.ts';
import { workflowsQueryKeys } from '../state/query-keys.ts';
import { AfterNode } from './after-node.tsx';
import { ConditionNode } from './condition-node.tsx';
import { ControlNode } from './control-node.tsx';
import { LoopResultNode } from './loop-result-node.tsx';
import { NestedNode } from './nested-node.tsx';
import { DefaultNode } from './step-node.tsx';
import { WorkflowClock } from './workflow-clock.tsx';
import { ZoomSlider } from './zoom-slider.tsx';

import '@xyflow/react/dist/style.css';

export interface WorkflowGraphRun {
  runId: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
}

export interface WorkflowGraphProps {
  snapshot: unknown;
  run: WorkflowGraphRun;
  onReplay?: (args: { stepId: string; originalPayload: unknown }) => void;
}

const nodeTypes = {
  'default-node': DefaultNode,
  'condition-node': ConditionNode,
  'loop-result-node': LoopResultNode,
  'nested-node': NestedNode,
  'after-node': AfterNode,
  'control-node': ControlNode,
};

function WorkflowGraphInner({ snapshot, run, onReplay }: WorkflowGraphProps) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    const { nodes: rawNodes, edges } = buildWorkflowGraph(snapshot);
    const snapContext = (
      snapshot as {
        context?: Record<string, { payload?: unknown; output?: unknown; error?: unknown }>;
      } | null
    )?.context;
    const enriched = rawNodes.map((n) => {
      if (n.type !== 'default-node') return n;
      const stepId = (n.data as { stepId: string }).stepId;
      const ctxEntry = snapContext?.[stepId];
      return {
        ...n,
        data: {
          ...n.data,
          stepInput: ctxEntry?.payload,
          stepOutput: ctxEntry?.output,
          stepError: ctxEntry?.error,
          ...(onReplay
            ? {
                runStatus: run.status,
                originalPayload: ctxEntry?.payload,
                onReplay,
              }
            : {}),
        },
      };
    });
    return { nodes: enriched, edges };
  }, [snapshot, run.status, onReplay]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const qc = useQueryClient();
  const cancel = useMutation({
    mutationFn: () => workflowsApi.cancelRun(run.runId),
    onMutate: () => setCancelling(true),
    onSettled: () => setCancelling(false),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: workflowsQueryKeys.run(run.runId) });
      void qc.invalidateQueries({ queryKey: workflowsQueryKeys.runSnapshot(run.runId) });
      void qc.invalidateQueries({ queryKey: workflowsQueryKeys.pendingApprovals() });
    },
  });

  const running = run.status === 'running' || run.status === 'paused';

  const overlay = (
    <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-md border border-[var(--color-hairline)] bg-[var(--color-canvas)] px-2 py-1 shadow-sm">
      <span className="text-xs text-[var(--color-ink-subtle)]">{run.status}</span>
      <span className="text-[var(--color-ink-subtle)]">·</span>
      <WorkflowClock
        startedAt={new Date(run.startedAt)}
        finishedAt={run.finishedAt ? new Date(run.finishedAt) : null}
        status={run.status}
      />
      {running ? (
        <button
          type="button"
          disabled={cancelling}
          className="ml-1 rounded border border-[var(--color-hairline)] px-2 py-0.5 text-xs hover:bg-[var(--color-surface-2)] disabled:opacity-60"
          onClick={() => cancel.mutate()}
        >
          {cancelling ? 'Cancelling…' : 'Cancel run'}
        </button>
      ) : null}
    </div>
  );

  if (initialNodes.length === 0) {
    return (
      <div className="relative h-full w-full">
        {overlay}
        <div className="grid h-full place-items-center text-sm text-[var(--color-ink-subtle)]">
          No graph data yet — the run hasn't produced a snapshot.
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {overlay}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.4}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <MiniMap pannable zoomable className="!bg-[var(--color-canvas)]" />
        <ZoomSlider />
      </ReactFlow>
    </div>
  );
}

export function WorkflowGraph(props: WorkflowGraphProps) {
  return (
    <ReactFlowProvider>
      <WorkflowGraphInner {...props} />
    </ReactFlowProvider>
  );
}
