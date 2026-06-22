import { GraphNodeCard } from '@seta/shared-ui';
import { Handle, type Node, type NodeProps, Position } from '@xyflow/react';
import type { OrgGraphNodeData } from './build-structure-graph.ts';

export function OrgGraphNode({ data }: NodeProps<Node<OrgGraphNodeData>>) {
  return (
    <>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <GraphNodeCard
        title={data.title}
        subtitle={data.subtitle}
        tone={data.tone}
        avatarShape={data.avatarShape}
        count={data.count}
        collapsible={data.collapsible}
        collapsed={data.collapsed}
        descendantCount={data.descendantCount}
        interactive={Boolean(data.personId || data.drillTo || data.collapsible)}
      />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </>
  );
}
