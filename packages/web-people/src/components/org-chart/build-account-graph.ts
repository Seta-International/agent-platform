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

/**
 * Account view (matches the prototype): the **Account Manager** is the root, the account's
 * **projects** hang under the AM, and each project's **members** hang under it. Accounts with no
 * AM fall back to an account-box root so the account still anchors its projects.
 */
export function buildAccountGraph(
  accounts: DeliveryAccount[],
  accountId: string | null,
): { nodes: Node<OrgGraphNodeData>[]; edges: Edge[] } {
  const nodes: Node<OrgGraphNodeData>[] = [];
  const edges: Edge[] = [];
  const acc = accounts.find((a) => a.account_id === accountId);
  if (!acc) return layout(nodes, edges);

  let rootId: string;
  if (acc.am) {
    rootId = `am:${acc.am.person_id}`;
    nodes.push({
      id: rootId,
      type: 'org',
      position: { x: 0, y: 0 },
      data: {
        title: acc.am.full_name,
        subtitle: `Account Manager · ${acc.name}`,
        tone: 'surface',
        avatarShape: 'circle',
        entity: 'person',
        personId: acc.am.person_id,
      },
    });
  } else {
    rootId = `acct:${acc.account_id}`;
    nodes.push({
      id: rootId,
      type: 'org',
      position: { x: 0, y: 0 },
      data: {
        title: acc.name,
        subtitle: `${acc.projects.length} project${acc.projects.length === 1 ? '' : 's'}`,
        tone: 'surface',
        avatarShape: 'square',
        entity: 'account',
        count: acc.projects.length,
      },
    });
  }

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
        count: p.members.length,
        nav: { view: 'project', projectId: p.project_id, accountId: acc.account_id },
      },
    });
    edges.push({
      id: `e:root-${acc.account_id}->p-${p.project_id}`,
      source: rootId,
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
