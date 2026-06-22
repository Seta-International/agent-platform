import type { Edge, Node } from '@xyflow/react';
import type { DeliveryAccount } from '../../api/org-client.ts';
import { EDGE, layout, type OrgGraphNodeData } from './graph-layout.ts';

function memberNode(
  projectId: string,
  m: { person_id: string; full_name: string; is_lead: boolean },
): Node<OrgGraphNodeData> {
  return {
    id: `person:${projectId}:${m.person_id}`,
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
  };
}

export function buildAccountGraph(
  accounts: DeliveryAccount[],
  accountId: string | null,
): { nodes: Node<OrgGraphNodeData>[]; edges: Edge[] } {
  const nodes: Node<OrgGraphNodeData>[] = [];
  const edges: Edge[] = [];
  const acc = accounts.find((a) => a.account_id === accountId);
  if (!acc) return layout(nodes, edges);

  nodes.push({
    id: `acct:${acc.account_id}`,
    type: 'org',
    position: { x: 0, y: 0 },
    data: {
      title: acc.name,
      subtitle: acc.am ? `AM: ${acc.am.full_name}` : undefined,
      tone: 'surface',
      avatarShape: 'square',
      entity: 'account',
      count: acc.projects.length || undefined,
    },
  });

  for (const p of acc.projects) {
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
        nav: { view: 'project', projectId: p.project_id, accountId: acc.account_id },
      },
    });
    edges.push({
      id: `e:a-${acc.account_id}->p-${p.project_id}`,
      source: `acct:${acc.account_id}`,
      target: `proj:${p.project_id}`,
      ...EDGE,
    });
    for (const m of p.members) {
      nodes.push(memberNode(p.project_id, m));
      edges.push({
        id: `e:p-${p.project_id}->w-${m.person_id}`,
        source: `proj:${p.project_id}`,
        target: `person:${p.project_id}:${m.person_id}`,
        ...EDGE,
      });
    }
  }
  return layout(nodes, edges);
}
