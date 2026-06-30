import type { Edge, Node } from '@xyflow/react';
import type { DeliveryAccount } from '../../api/org-client.ts';
import { EDGE, layout, type OrgGraphNodeData } from './graph-layout.ts';

type Account = DeliveryAccount;
type Project = Account['projects'][number];
type Member = Project['members'][number];

function amNode(am: NonNullable<Account['am']>): Node<OrgGraphNodeData> {
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

function accountNode(acc: Account): Node<OrgGraphNodeData> {
  return {
    id: `acct:${acc.account_id}`,
    type: 'org',
    position: { x: 0, y: 0 },
    data: {
      title: acc.name,
      subtitle: `${acc.projects.length} project${acc.projects.length === 1 ? '' : 's'}`,
      tone: 'surface',
      avatarShape: 'square',
      entity: 'account',
      count: acc.projects.length,
      nav: { view: 'account', accountId: acc.account_id },
    },
  };
}

function projectNode(p: Project): Node<OrgGraphNodeData> {
  const memberCount = p.members.length;
  return {
    id: `proj:${p.project_id}`,
    type: 'org',
    position: { x: 0, y: 0 },
    data: {
      title: p.name,
      subtitle:
        memberCount === 0
          ? 'No members allocated'
          : `${memberCount} member${memberCount === 1 ? '' : 's'}`,
      tone: 'surface',
      avatarShape: 'square',
      entity: 'project',
      count: memberCount,
    },
  };
}

function memberNode(projectId: string, m: Member): Node<OrgGraphNodeData> {
  return {
    id: `person:${projectId}:${m.person_id}`,
    type: 'org',
    position: { x: 0, y: 0 },
    data: {
      title: m.full_name,
      subtitle: m.is_lead ? 'Engagement Manager' : 'Member',
      tone: m.is_lead ? 'primary' : 'surface',
      avatarShape: 'circle',
      entity: 'person',
      personId: m.person_id,
    },
  };
}

/**
 * Project view hierarchy: AM → Account → Project → Members.
 * The engagement manager (is_lead) is visually highlighted with primary tone.
 * When there is no AM, Account is the root.
 */
export function buildProjectGraph(
  accounts: DeliveryAccount[],
  projectId: string | null,
): { nodes: Node<OrgGraphNodeData>[]; edges: Edge[] } {
  const nodes: Node<OrgGraphNodeData>[] = [];
  const edges: Edge[] = [];

  const acc = accounts.find((a) => a.projects.some((p) => p.project_id === projectId));
  const project = acc?.projects.find((p) => p.project_id === projectId);
  if (!acc || !project) return layout(nodes, edges);

  const acctNode = accountNode(acc);
  nodes.push(acctNode);

  if (acc.am) {
    const am = amNode(acc.am);
    nodes.push(am);
    edges.push({
      id: `e:am-${acc.am.person_id}->acct-${acc.account_id}`,
      source: am.id,
      target: acctNode.id,
      ...EDGE,
    });
  }

  const proj = projectNode(project);
  nodes.push(proj);
  edges.push({
    id: `e:acct-${acc.account_id}->proj-${project.project_id}`,
    source: acctNode.id,
    target: proj.id,
    ...EDGE,
  });

  // Leads first so they render at top of the member level in the layout
  const sorted = [...project.members].sort((a, b) => Number(b.is_lead) - Number(a.is_lead));
  for (const m of sorted) {
    const member = memberNode(project.project_id, m);
    nodes.push(member);
    edges.push({
      id: `e:proj-${project.project_id}->person-${m.person_id}`,
      source: proj.id,
      target: member.id,
      ...EDGE,
    });
  }

  return layout(nodes, edges);
}
