import type { Edge, Node } from '@xyflow/react';
import type { DeliveryAccount, OrgUnitNode } from '../../api/org-client.ts';
import { buildDeliveryHierarchy } from './delivery-nodes.ts';
import { emptyNode, layout, mkEdge, type OrgGraphNodeData } from './graph-layout.ts';

type UnitMember = OrgUnitNode['members'][number];

// ─── node builders ────────────────────────────────────────────────────────────

function deptNode(u: OrgUnitNode): Node<OrgGraphNodeData> {
  const count = u.members.length;
  return {
    id: u.id,
    type: 'org',
    position: { x: 0, y: 0 },
    data: {
      title: u.name,
      subtitle: count > 0 ? `${count} member${count > 1 ? 's' : ''}` : undefined,
      tone: 'surface',
      avatarShape: 'square',
      entity: 'department',
      count: count > 0 ? count : undefined,
      nav: { view: 'department', deptId: u.id },
    },
  };
}

function memberNode(deptId: string, m: UnitMember): Node<OrgGraphNodeData> {
  return {
    id: `member:${deptId}:${m.person_id}`,
    type: 'org',
    position: { x: 0, y: 0 },
    data: {
      title: m.full_name,
      subtitle: m.job_title ?? undefined,
      tone: 'surface',
      avatarSrc: m.photo_url ?? undefined,
      avatarShape: 'circle',
      entity: 'person',
      personId: m.person_id,
    },
  };
}

function subDeptHeadNode(
  deptId: string,
  head: NonNullable<OrgUnitNode['head']>,
): Node<OrgGraphNodeData> {
  return {
    id: `head:${deptId}:${head.person_id}`,
    type: 'org',
    position: { x: 0, y: 0 },
    data: {
      title: head.full_name,
      subtitle: 'Head',
      tone: 'surface',
      avatarSrc: head.photo_url ?? undefined,
      avatarShape: 'circle',
      entity: 'person',
      personId: head.person_id,
    },
  };
}

// ─── main export ──────────────────────────────────────────────────────────────

/**
 * Department view — renders the selected unit as the root node of the chart.
 *
 * For delivery-type units (`kind === 'delivery'`), renders the account manager
 * and account hierarchy using shared `buildDeliveryHierarchy`.
 *
 * For non-delivery units, content below the selected unit follows three priorities:
 *   1. Unit has members → show all people sorted alpha (subtitle = job_title).
 *   2. Unit has child sub-departments → show children each with their head.
 *   3. Leaf unit with only a head → show the head directly.
 */
export function buildDepartmentGraph(
  units: OrgUnitNode[],
  deptId: string | null,
  accounts: DeliveryAccount[] = [],
): { nodes: Node<OrgGraphNodeData>[]; edges: Edge[] } {
  const nodes: Node<OrgGraphNodeData>[] = [];
  const edges: Edge[] = [];

  const selected = units.find((u) => u.id === deptId);
  if (!selected) return layout(nodes, edges);

  // Selected department is the root node.
  nodes.push(deptNode(selected));

  // Delivery units strictly use the account-manager → account hierarchy.
  if (selected.kind === 'delivery') {
    const deliveryGraph = buildDeliveryHierarchy(selected.id, accounts);
    nodes.push(...deliveryGraph.nodes);
    edges.push(...deliveryGraph.edges);
    return layout(nodes, edges);
  }

  // Priority 1: unit has people assigned — show all members.
  if (selected.members.length > 0) {
    const sorted = [...selected.members].sort((a, b) => a.full_name.localeCompare(b.full_name));
    for (const m of sorted) {
      const node = memberNode(selected.id, m);
      nodes.push(node);
      edges.push(mkEdge(selected.id, node.id));
    }
    return layout(nodes, edges);
  }

  // Priority 2: show child sub-departments, each with their head.
  const children = units
    .filter((u) => u.parent_id === selected.id)
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));

  if (children.length > 0) {
    for (const child of children) {
      nodes.push(deptNode(child));
      edges.push(mkEdge(selected.id, child.id));
      if (child.head) {
        const headNode = subDeptHeadNode(child.id, child.head);
        nodes.push(headNode);
        edges.push(mkEdge(child.id, headNode.id));
      }
    }
    return layout(nodes, edges);
  }

  // Priority 3: leaf unit — show just the head if present.
  if (selected.head) {
    const headNode = subDeptHeadNode(selected.id, selected.head);
    nodes.push(headNode);
    edges.push(mkEdge(selected.id, headNode.id));
    return layout(nodes, edges);
  }

  // Fallback: nothing to show — empty state.
  const empty = emptyNode(`empty:${selected.id}`, 'No members allocated');
  nodes.push(empty);
  edges.push(mkEdge(selected.id, empty.id));

  return layout(nodes, edges);
}
