import { GraphZoomControls } from '@seta/shared-ui';
import {
  Background,
  BackgroundVariant,
  type Edge,
  type Node,
  type NodeMouseHandler,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import { useLayoutEffect, useRef, useState } from 'react';
import type { OrgGraphNodeData } from './graph-layout.ts';
import { OrgGraphNode } from './org-graph-node.tsx';

import '@xyflow/react/dist/style.css';

const nodeTypes = { org: OrgGraphNode };

export interface OrgChartCanvasProps {
  nodes: Node<OrgGraphNodeData>[];
  edges: Edge[];
  onNodeClick: (data: OrgGraphNodeData) => void;
}

function Inner({ nodes: inNodes, edges: inEdges, onNodeClick }: OrgChartCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(inNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(inEdges);
  const { zoomIn, zoomOut, fitView, getZoom } = useReactFlow();
  const [zoomPct, setZoomPct] = useState(80);

  useLayoutEffect(() => {
    setNodes(inNodes);
    setEdges(inEdges);
  }, [inNodes, inEdges, setNodes, setEdges]);

  const prevNodes = useRef(inNodes.length);
  useLayoutEffect(() => {
    // skip first mount — fitOnInit handles it
    if (prevNodes.current === 0) {
      prevNodes.current = inNodes.length;
      return;
    }
    prevNodes.current = inNodes.length;
    fitView({ padding: 0.2 });
  }, [inNodes, fitView]);

  const handleNodeClick: NodeMouseHandler = (_e, node) =>
    onNodeClick((node as Node<OrgGraphNodeData>).data);

  return (
    <div className="relative h-full w-full">
      <div className="absolute right-3 top-3 z-10">
        <GraphZoomControls
          zoomPct={zoomPct}
          onZoomIn={() => {
            void zoomIn();
            setZoomPct(Math.round(getZoom() * 100));
          }}
          onZoomOut={() => {
            void zoomOut();
            setZoomPct(Math.round(getZoom() * 100));
          }}
          onFit={() => {
            void fitView({ padding: 0.2 });
          }}
        />
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onMoveEnd={() => setZoomPct(Math.round(getZoom() * 100))}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.4}
        maxZoom={1.3}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        panOnDrag={[1, 2]}
        elementsSelectable
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} />
      </ReactFlow>
    </div>
  );
}

export function OrgChartCanvas(props: OrgChartCanvasProps) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}
