import type { Edge, Node } from '@xyflow/react';
import type { DeliveryAccount } from '../../api/org-client.ts';
import { accountNode, amNode, memberNode, projectNode } from './delivery-nodes.ts';
import { emptyNode, layout, mkEdge, type OrgGraphNodeData } from './graph-layout.ts';

/**
 * Project view hierarchy: AM → Account → Project → Members.
 * The engagement manager (is_lead) is visually highlighted with primary tone.
 * Account node is clickable and navigates back to the account drilldown.
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

  const acctNode = accountNode(acc, {
    count: acc.projects.length,
    nav: { view: 'account', accountId: acc.account_id },
  });
  nodes.push(acctNode);

  if (acc.am) {
    const am = amNode(acc.am);
    nodes.push(am);
    edges.push(mkEdge(am.id, acctNode.id));
  }

  const proj = projectNode(project);
  nodes.push(proj);
  edges.push(mkEdge(acctNode.id, proj.id));

  if (project.members.length === 0) {
    const empty = emptyNode(`empty:proj-${project.project_id}`, 'No members allocated');
    nodes.push(empty);
    edges.push(mkEdge(proj.id, empty.id));
  } else {
    // Leads first so they render at the top of the member level in the layout
    const sorted = [...project.members].sort((a, b) => Number(b.is_lead) - Number(a.is_lead));
    for (const m of sorted) {
      const member = memberNode(project.project_id, m, { highlightLead: true });
      nodes.push(member);
      edges.push(mkEdge(proj.id, member.id));
    }
  }

  return layout(nodes, edges);
}
