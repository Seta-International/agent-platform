import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import { useEffect, useMemo } from 'react';
import { buildWorkflowGraph } from '../lib/build-graph.ts';
import { AfterNode } from './after-node.tsx';
import { ConditionNode } from './condition-node.tsx';
import { ControlNode } from './control-node.tsx';
import { LoopResultNode } from './loop-result-node.tsx';
import { NestedNode } from './nested-node.tsx';
import { DefaultNode } from './step-node.tsx';

import '@xyflow/react/dist/style.css';

export interface WorkflowGraphProps {
  snapshot: unknown;
}

const nodeTypes = {
  'default-node': DefaultNode,
  'condition-node': ConditionNode,
  'loop-result-node': LoopResultNode,
  'nested-node': NestedNode,
  'after-node': AfterNode,
  'control-node': ControlNode,
};

function WorkflowGraphInner({ snapshot }: WorkflowGraphProps) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildWorkflowGraph(snapshot),
    [snapshot],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  if (initialNodes.length === 0) {
    return (
      <div className="grid h-full place-items-center text-sm text-[var(--color-ink-subtle)]">
        No graph data yet — the run hasn't produced a snapshot.
      </div>
    );
  }

  return (
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
      <Controls showInteractive={false} />
      <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
    </ReactFlow>
  );
}

export function WorkflowGraph(props: WorkflowGraphProps) {
  return (
    <ReactFlowProvider>
      <WorkflowGraphInner {...props} />
    </ReactFlowProvider>
  );
}
