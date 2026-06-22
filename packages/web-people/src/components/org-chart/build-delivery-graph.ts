import type { Edge, Node } from '@xyflow/react';
import type { DeliveryAccount } from '../../api/org-client.ts';
import { type DeliveryDrill, EDGE, layout, type OrgGraphNodeData } from './graph-layout.ts';

export type { DeliveryDrill } from './graph-layout.ts';

function acctNode(a: DeliveryAccount, drillTo?: DeliveryDrill): Node<OrgGraphNodeData> {
  return {
    id: `acct:${a.account_id}`,
    type: 'org',
    position: { x: 0, y: 0 },
    data: {
      title: a.name,
      subtitle: a.am ? `AM: ${a.am.full_name}` : `${a.projects.length} projects`,
      tone: 'surface',
      avatarShape: 'square',
      count: a.projects.length || undefined,
      collapsible: false,
      collapsed: false,
      drillTo,
    },
  };
}

export function buildDeliveryGraph(
  accounts: DeliveryAccount[],
  drill: DeliveryDrill,
): { nodes: Node<OrgGraphNodeData>[]; edges: Edge[] } {
  const nodes: Node<OrgGraphNodeData>[] = [];
  const edges: Edge[] = [];

  if (drill.level === 'accounts') {
    for (const a of accounts)
      nodes.push(acctNode(a, { level: 'account', accountId: a.account_id }));
    return layout(nodes, edges);
  }

  const acc = accounts.find((a) => a.account_id === drill.accountId);
  if (!acc) return layout(nodes, edges);
  nodes.push(acctNode(acc));

  if (drill.level === 'account') {
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
          count: p.members.length || undefined,
          collapsible: false,
          collapsed: false,
          drillTo: { level: 'project', accountId: acc.account_id, projectId: p.project_id },
        },
      });
      edges.push({
        id: `e:a-${acc.account_id}->p-${p.project_id}`,
        source: `acct:${acc.account_id}`,
        target: `proj:${p.project_id}`,
        ...EDGE,
      });
    }
    return layout(nodes, edges);
  }

  // level === 'project'
  const proj = acc.projects.find((p) => p.project_id === drill.projectId);
  if (!proj) return layout(nodes, edges);
  nodes.push({
    id: `proj:${proj.project_id}`,
    type: 'org',
    position: { x: 0, y: 0 },
    data: {
      title: proj.name,
      subtitle: `${proj.members.length} members`,
      tone: 'surface',
      avatarShape: 'square',
      collapsible: false,
      collapsed: false,
    },
  });
  edges.push({
    id: `e:a-${acc.account_id}->p-${proj.project_id}`,
    source: `acct:${acc.account_id}`,
    target: `proj:${proj.project_id}`,
    ...EDGE,
  });
  for (const m of proj.members) {
    nodes.push({
      id: `person:${m.person_id}`,
      type: 'org',
      position: { x: 0, y: 0 },
      data: {
        title: m.full_name,
        subtitle: m.is_lead ? 'Lead' : 'Member',
        tone: 'surface',
        avatarShape: 'circle',
        collapsible: false,
        collapsed: false,
        personId: m.person_id,
      },
    });
    edges.push({
      id: `e:p-${proj.project_id}->w-${m.person_id}`,
      source: `proj:${proj.project_id}`,
      target: `person:${m.person_id}`,
      ...EDGE,
    });
  }
  return layout(nodes, edges);
}
