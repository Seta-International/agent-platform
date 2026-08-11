import type { Edge, Node } from '@xyflow/react';
import type { DeliveryAccount } from '../../api/org-client.ts';
import { emptyNode, mkEdge, type OrgGraphNodeData, type OrgNav } from './graph-layout.ts';

type Account = DeliveryAccount;
type Project = Account['projects'][number];
type Member = Project['members'][number];

export function amNode(am: NonNullable<Account['am']>): Node<OrgGraphNodeData> {
  return {
    id: `am:${am.person_id}`,
    type: 'org',
    position: { x: 0, y: 0 },
    data: {
      title: am.full_name,
      subtitle: 'Account Manager',
      tone: 'surface',
      avatarSrc: am.photo_url ?? undefined,
      avatarShape: 'circle',
      entity: 'person',
      personId: am.person_id,
    },
  };
}

export function accountNode(
  acc: Account,
  opts: { count: number; nav?: OrgNav },
): Node<OrgGraphNodeData> {
  const projectCount = acc.projects.length;
  return {
    id: `acct:${acc.account_id}`,
    type: 'org',
    position: { x: 0, y: 0 },
    data: {
      title: acc.name,
      subtitle: `${projectCount} project${projectCount === 1 ? '' : 's'}`,
      tone: 'surface',
      avatarShape: 'square',
      entity: 'account',
      count: opts.count,
      nav: opts.nav,
    },
  };
}

export function projectNode(p: Project, opts: { nav?: OrgNav } = {}): Node<OrgGraphNodeData> {
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
      nav: opts.nav,
    },
  };
}

export function memberNode(
  projectId: string,
  m: Member,
  opts: { highlightLead: boolean },
): Node<OrgGraphNodeData> {
  return {
    id: `person:${projectId}:${m.person_id}`,
    type: 'org',
    position: { x: 0, y: 0 },
    data: {
      title: m.full_name,
      subtitle: m.is_lead ? (opts.highlightLead ? 'Engagement Manager' : 'Lead') : 'Member',
      tone: opts.highlightLead && m.is_lead ? 'primary' : 'surface',
      avatarSrc: m.photo_url ?? undefined,
      avatarShape: 'circle',
      entity: 'person',
      personId: m.person_id,
    },
  };
}

export function buildDeliveryHierarchy(
  parentId: string,
  accounts: DeliveryAccount[],
): { nodes: Node<OrgGraphNodeData>[]; edges: Edge[] } {
  const nodes: Node<OrgGraphNodeData>[] = [];
  const edges: Edge[] = [];

  if (accounts.length === 0) {
    const empty = emptyNode(`empty:${parentId}`, 'No accounts allocated');
    nodes.push(empty);
    edges.push(mkEdge(parentId, empty.id));
    return { nodes, edges };
  }

  const amEmitted = new Set<string>();
  for (const acc of accounts) {
    let currentParentId = parentId;
    if (acc.am?.person_id && acc.am?.full_name) {
      const am = amNode(acc.am);
      if (!amEmitted.has(acc.am.person_id)) {
        amEmitted.add(acc.am.person_id);
        nodes.push(am);
        edges.push(mkEdge(parentId, am.id));
      }
      currentParentId = am.id;
    }

    const acct = accountNode(acc, {
      count: acc.projects.length,
      nav: { view: 'account', accountId: acc.account_id },
    });
    nodes.push(acct);
    edges.push(mkEdge(currentParentId, acct.id));
  }

  return { nodes, edges };
}
