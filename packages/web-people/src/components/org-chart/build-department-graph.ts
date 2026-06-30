import type { Edge, Node } from '@xyflow/react';
import type { OrgUnitNode } from '../../api/org-client.ts';
import { EDGE, layout, type OrgGraphNodeData } from './graph-layout.ts';

function deptNode(u: OrgUnitNode): Node<OrgGraphNodeData> {
  return {
    id: u.id,
    type: 'org',
    position: { x: 0, y: 0 },
    data: {
      title: u.name,
      subtitle: u.head?.full_name,
      tone: 'surface',
      avatarShape: 'square',
      entity: 'department',
      nav: { view: 'department', deptId: u.id },
    },
  };
}

function headPersonNode(
  deptId: string,
  head: { person_id: string; full_name: string },
): Node<OrgGraphNodeData> {
  return {
    id: `head:${deptId}:${head.person_id}`,
    type: 'org',
    position: { x: 0, y: 0 },
    data: {
      title: head.full_name,
      subtitle: 'Head',
      tone: 'surface',
      avatarShape: 'circle',
      entity: 'person',
      personId: head.person_id,
    },
  };
}

/**
 * Department view: root = selected dept, children = direct sub-departments, each with their head
 * as a leaf person node. Clicking a child dept node drills into it via OrgNav.
 */
export function buildDepartmentGraph(
  units: OrgUnitNode[],
  deptId: string | null,
): { nodes: Node<OrgGraphNodeData>[]; edges: Edge[] } {
  const nodes: Node<OrgGraphNodeData>[] = [];
  const edges: Edge[] = [];

  const root = units.find((u) => u.id === deptId);
  if (!root) return layout(nodes, edges);

  nodes.push(deptNode(root));

  const children = units
    .filter((u) => u.parent_id === root.id)
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));

  if (children.length > 0) {
    for (const child of children) {
      nodes.push(deptNode(child));
      edges.push({ id: `e:${root.id}->${child.id}`, source: root.id, target: child.id, ...EDGE });
      if (child.head) {
        const headNode = headPersonNode(child.id, child.head);
        nodes.push(headNode);
        edges.push({
          id: `e:${child.id}->${headNode.id}`,
          source: child.id,
          target: headNode.id,
          ...EDGE,
        });
      }
    }
  } else if (root.head) {
    // Leaf dept — show its head directly under the root
    const headNode = headPersonNode(root.id, root.head);
    nodes.push(headNode);
    edges.push({
      id: `e:${root.id}->${headNode.id}`,
      source: root.id,
      target: headNode.id,
      ...EDGE,
    });
  }

  return layout(nodes, edges);
}
