import Dagre from '@dagrejs/dagre';
import type { Edge, Node } from '@xyflow/react';
import { MarkerType, Position } from '@xyflow/react';
import type { OrgUnitNode } from '../../api/org-client.ts';
import type { DeliveryDrill } from './build-delivery-graph.ts';

export interface OrgGraphNodeData extends Record<string, unknown> {
  title: string;
  subtitle?: string;
  tone: 'surface' | 'solid' | 'primary';
  avatarShape: 'circle' | 'square';
  count?: number;
  collapsible: boolean;
  collapsed: boolean;
  descendantCount?: number;
  personId?: string;
  unitId?: string;
  drillTo?: DeliveryDrill;
}

const NODE_W = 210;
const NODE_H = 64;
const EDGE = {
  type: 'smoothstep' as const,
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 14,
    height: 14,
    color: 'var(--color-ink-subtle)',
  },
};

function unitTone(kind: string): OrgGraphNodeData['tone'] {
  return kind === 'executive' ? 'primary' : 'solid';
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

export function buildStructureGraph(
  units: OrgUnitNode[],
  collapsed: Set<string>,
): { nodes: Node<OrgGraphNodeData>[]; edges: Edge[] } {
  const byId = new Map(units.map((u) => [u.id, u]));
  const childUnits = new Map<string | null, OrgUnitNode[]>();
  for (const u of units) {
    const arr = childUnits.get(u.parent_id) ?? [];
    arr.push(u);
    childUnits.set(u.parent_id, arr);
  }

  // descendant person count for a unit's collapsed badge (members of its whole subtree)
  function descendantPersons(unitId: string): number {
    const u = byId.get(unitId);
    if (!u) return 0;
    let n = u.members.length;
    for (const c of childUnits.get(unitId) ?? []) n += descendantPersons(c.id);
    return n;
  }

  const nodes: Node<OrgGraphNodeData>[] = [];
  const edges: Edge[] = [];

  function walk(u: OrgUnitNode): void {
    const unitNodeId = `unit:${u.id}`;
    const isCollapsed = collapsed.has(unitNodeId);
    nodes.push({
      id: unitNodeId,
      type: 'org',
      position: { x: 0, y: 0 },
      data: {
        title: u.name,
        subtitle: u.head ? `Head: ${u.head.full_name}` : u.kind,
        tone: unitTone(u.kind),
        avatarShape: 'square',
        count: u.members.length || undefined,
        collapsible: u.members.length > 0 || (childUnits.get(u.id)?.length ?? 0) > 0,
        collapsed: isCollapsed,
        descendantCount: isCollapsed ? descendantPersons(u.id) : undefined,
        unitId: u.id,
      },
    });
    if (u.parent_id)
      edges.push({
        id: `e:${u.parent_id}->${u.id}`,
        source: `unit:${u.parent_id}`,
        target: unitNodeId,
        ...EDGE,
      });
    if (isCollapsed) return; // hide members + descendant units
    for (const m of u.members) {
      const pid = `person:${m.person_id}`;
      nodes.push({
        id: pid,
        type: 'org',
        position: { x: 0, y: 0 },
        data: {
          title: m.full_name,
          subtitle: m.job_title ?? undefined,
          tone: 'surface',
          avatarShape: 'circle',
          collapsible: false,
          collapsed: false,
          personId: m.person_id,
        },
      });
      edges.push({ id: `e:${u.id}->p:${m.person_id}`, source: unitNodeId, target: pid, ...EDGE });
    }
    for (const c of childUnits.get(u.id) ?? []) walk(c);
  }

  for (const root of childUnits.get(null) ?? []) walk(root);
  return layout(nodes, edges);
}
