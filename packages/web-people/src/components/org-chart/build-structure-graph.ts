import type { Edge, Node } from '@xyflow/react';
import type { OrgUnitNode } from '../../api/org-client.ts';
import { EDGE, layout, type OrgGraphNodeData } from './graph-layout.ts';

export type { OrgGraphNodeData } from './graph-layout.ts';
export { layout } from './graph-layout.ts';

function unitTone(kind: string): OrgGraphNodeData['tone'] {
  return kind === 'executive' ? 'primary' : 'solid';
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
