import Dagre from '@dagrejs/dagre';
import type { Edge, Node } from '@xyflow/react';
import { MarkerType, Position } from '@xyflow/react';

export type DeliveryDrill =
  | { level: 'accounts' }
  | { level: 'account'; accountId: string }
  | { level: 'project'; accountId: string; projectId: string };

export interface OrgGraphNodeData extends Record<string, unknown> {
  title: string;
  subtitle?: string;
  tone: 'surface' | 'solid' | 'primary';
  avatarShape: 'circle' | 'square';
  count?: number;
  collapsible?: boolean;
  collapsed?: boolean;
  descendantCount?: number;
  personId?: string;
  unitId?: string;
  accountId?: string;
  drillTo?: DeliveryDrill;
}

const NODE_W = 210;
const NODE_H = 64;

export const EDGE = {
  type: 'smoothstep' as const,
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 14,
    height: 14,
    color: 'var(--color-ink-subtle)',
  },
};

/** Lay out with dagre top-to-bottom; returns nodes with positions + handle sides set. */
export function layout(
  nodes: Node<OrgGraphNodeData>[],
  edges: Edge[],
): { nodes: Node<OrgGraphNodeData>[]; edges: Edge[] } {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 24, ranksep: 56 });
  for (const n of nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  for (const e of edges) g.setEdge(e.source, e.target);
  Dagre.layout(g);
  return {
    nodes: nodes.map((n) => {
      const { x, y } = g.node(n.id);
      return {
        ...n,
        position: { x: x - NODE_W / 2, y: y - NODE_H / 2 },
        targetPosition: Position.Top,
        sourcePosition: Position.Bottom,
      };
    }),
    edges,
  };
}
