import type { Edge, Node } from '@xyflow/react';
import type { DeliveryAccount } from '../../api/org-client.ts';
import { EDGE, layout, type OrgGraphNodeData } from './graph-layout.ts';

export function buildProjectGraph(
  accounts: DeliveryAccount[],
  projectId: string | null,
): { nodes: Node<OrgGraphNodeData>[]; edges: Edge[] } {
  const nodes: Node<OrgGraphNodeData>[] = [];
  const edges: Edge[] = [];
  for (const a of accounts) {
    const p = a.projects.find((x) => x.project_id === projectId);
    if (!p) continue;
    nodes.push({
      id: `proj:${p.project_id}`,
      type: 'org',
      position: { x: 0, y: 0 },
      data: {
        title: p.name,
        subtitle: `${p.members.length} member${p.members.length === 1 ? '' : 's'}`,
        tone: 'surface',
        avatarShape: 'square',
        entity: 'project',
        count: p.members.length || undefined,
      },
    });
    for (const m of p.members) {
      nodes.push({
        id: `person:${p.project_id}:${m.person_id}`,
        type: 'org',
        position: { x: 0, y: 0 },
        data: {
          title: m.full_name,
          subtitle: m.is_lead ? 'Lead' : 'Member',
          tone: 'surface',
          avatarShape: 'circle',
          entity: 'person',
          personId: m.person_id,
        },
      });
      edges.push({
        id: `e:p-${p.project_id}->w-${m.person_id}`,
        source: `proj:${p.project_id}`,
        target: `person:${p.project_id}:${m.person_id}`,
        ...EDGE,
      });
    }
    break;
  }
  return layout(nodes, edges);
}
