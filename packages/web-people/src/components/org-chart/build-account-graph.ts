import type { Edge, Node } from '@xyflow/react';
import type { DeliveryAccount } from '../../api/org-client.ts';
import { accountNode, amNode, memberNode, projectNode } from './delivery-nodes.ts';
import { emptyNode, layout, mkEdge, type OrgGraphNodeData } from './graph-layout.ts';

/**
 * Account view hierarchy: AM → Account (total members badge) → Projects → People.
 * Projects are clickable and navigate to the project drilldown.
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
  const acctNode = accountNode(acc, { count: totalMembers });
  nodes.push(acctNode);

  if (acc.am) {
    const am = amNode(acc.am);
    nodes.push(am);
    edges.push(mkEdge(am.id, acctNode.id));
  }

  if (acc.projects.length === 0) {
    const empty = emptyNode(`empty:acct-${acc.account_id}`, 'No projects allocated');
    nodes.push(empty);
    edges.push(mkEdge(acctNode.id, empty.id));
    return layout(nodes, edges);
  }

  for (const p of acc.projects) {
    const proj = projectNode(p, {
      nav: { view: 'project', projectId: p.project_id, accountId: acc.account_id },
    });
    nodes.push(proj);
    edges.push(mkEdge(acctNode.id, proj.id));

    if (p.members.length === 0) {
      const empty = emptyNode(`empty:proj-${p.project_id}`, 'No members allocated');
      nodes.push(empty);
      edges.push(mkEdge(proj.id, empty.id));
    } else {
      for (const m of p.members) {
        const member = memberNode(p.project_id, m, { highlightLead: false });
        nodes.push(member);
        edges.push(mkEdge(proj.id, member.id));
      }
    }
  }

  return layout(nodes, edges);
}
