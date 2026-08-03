import Dagre from '@dagrejs/dagre';
import type { Edge, Node } from '@xyflow/react';
import { MarkerType, Position } from '@xyflow/react';

/** Visual type of a node — drives its icon, accent rail and avatar shape. */
export type OrgNodeEntity = 'department' | 'person' | 'account' | 'project' | 'empty';

/** Where a node click drills to. `person` nodes use `personId` instead. */
export type OrgNav =
  | { view: 'account'; accountId?: string }
  | { view: 'project'; projectId: string; accountId?: string }
  | { view: 'department'; deptId: string };

export interface OrgGraphNodeData extends Record<string, unknown> {
  title: string;
  subtitle?: string;
  tone: 'surface' | 'solid' | 'primary';
  avatarShape: 'circle' | 'square';
  /** Person photo for the avatar slot. Undefined → Avatar renders name initials at the same size. */
  avatarSrc?: string;
  entity: OrgNodeEntity;
  count?: number;
  personId?: string;
  nav?: OrgNav;
}

export const NODE_W = 210;
const NODE_H = 64;

export const EDGE = {
  type: 'smoothstep' as const,
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 14,
    height: 14,
    color: 'var(--color-text-secondary)',
  },
};

/** Creates an edge with a stable auto-generated id. */
export function mkEdge(source: string, target: string): Edge {
  return { id: `e:${source}->${target}`, source, target, ...EDGE };
}

/** Empty-state placeholder node — renders an italic message with no card chrome. */
export function emptyNode(id: string, message: string): Node<OrgGraphNodeData> {
  return {
    id,
    type: 'org',
    position: { x: 0, y: 0 },
    data: { title: message, tone: 'surface', avatarShape: 'square', entity: 'empty' },
  };
}

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
