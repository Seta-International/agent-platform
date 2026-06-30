import type { Edge, Node } from '@xyflow/react';
import type { DeliveryAccount } from '../../api/org-client.ts';
import { EDGE, layout, type OrgGraphNodeData } from './graph-layout.ts';

function amNode(am: NonNullable<DeliveryAccount['am']>): Node<OrgGraphNodeData> {
  return {
    id: `am:${am.person_id}`,
    type: 'org',
    position: { x: 0, y: 0 },
    data: {
      title: am.full_name,
      subtitle: 'Account Manager',
      tone: 'surface',
      avatarShape: 'circle',
      entity: 'person',
      personId: am.person_id,
    },
  };
}

function accountNode(acc: DeliveryAccount, totalMembers: number): Node<OrgGraphNodeData> {
  const projectLabel = `${acc.projects.length} project${acc.projects.length === 1 ? '' : 's'}`;
  return {
    id: `acct:${acc.account_id}`,
    type: 'org',
    position: { x: 0, y: 0 },
    data: {
      title: acc.name,
      subtitle: projectLabel,
      tone: 'surface',
      avatarShape: 'square',
      entity: 'account',
      count: totalMembers,
    },
  };
}

function projectNode(
  p: DeliveryAccount['projects'][number],
  accountId: string,
): Node<OrgGraphNodeData> {
  const memberCount = p.members.length;
  return {
    id: `proj:${p.project_id}`,
    type: 'org',
    position: { x: 0, y: 0 },
    data: {
      title: p.name,
      subtitle:
        memberCount === 0
          ? 'No members assigned'
          : `${memberCount} member${memberCount === 1 ? '' : 's'}`,
      tone: 'surface',
      avatarShape: 'square',
      entity: 'project',
      count: memberCount,
      nav: { view: 'project', projectId: p.project_id, accountId },
    },
  };
}

function memberNode(
  projectId: string,
  m: DeliveryAccount['projects'][number]['members'][number],
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

/**
 * Account view hierarchy: AM → Account (name + total members) → Projects → People.
 * When there is no AM the Account node is the root.
 */
export function buildAccountGraph(
  accounts: DeliveryAccount[],
  accountId: string | null,
): { nodes: Node<OrgGraphNodeData>[]; edges: Edge[] } {
  const nodes: Node<OrgGraphNodeData>[] = [];
  const edges: Edge[] = [];

  const acc = accounts.find((a) => a.account_id === accountId);
  if (!acc) return layout(nodes, edges);

  const totalMembers = acc.projects.reduce((sum, p) => sum + p.members.length, 0);
  const acctNodeId = `acct:${acc.account_id}`;

  nodes.push(accountNode(acc, totalMembers));

  if (acc.am) {
    const am = amNode(acc.am);
    nodes.push(am);
    edges.push({
      id: `e:am-${acc.am.person_id}->acct-${acc.account_id}`,
      source: am.id,
      target: acctNodeId,
      ...EDGE,
    });
  }

  for (const p of acc.projects) {
    const proj = projectNode(p, acc.account_id);
    nodes.push(proj);
    edges.push({
      id: `e:acct-${acc.account_id}->proj-${p.project_id}`,
      source: acctNodeId,
      target: proj.id,
      ...EDGE,
    });

    for (const m of p.members) {
      const member = memberNode(p.project_id, m);
      nodes.push(member);
      edges.push({
        id: `e:proj-${p.project_id}->person-${m.person_id}`,
        source: proj.id,
        target: member.id,
        ...EDGE,
      });
    }
  }

  return layout(nodes, edges);
}
