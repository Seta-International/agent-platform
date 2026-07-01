import type { Node } from '@xyflow/react';
import type { DeliveryAccount } from '../../api/org-client.ts';
import type { OrgGraphNodeData, OrgNav } from './graph-layout.ts';

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
      avatarShape: 'circle',
      entity: 'person',
      personId: m.person_id,
    },
  };
}
