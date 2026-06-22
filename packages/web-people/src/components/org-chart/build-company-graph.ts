import type { Edge, Node } from '@xyflow/react';
import type { CompanyNode } from '../../api/org-client.ts';
import { EDGE, layout, type OrgGraphNodeData } from './graph-layout.ts';

export type { OrgGraphNodeData } from './graph-layout.ts';

function tone(kind: CompanyNode['kind']): OrgGraphNodeData['tone'] {
  if (kind === 'executive') return 'primary';
  if (kind === 'am' || kind === 'account') return 'surface';
  return 'solid';
}

function toNode(c: CompanyNode): Node<OrgGraphNodeData> {
  return {
    id: c.id,
    type: 'org',
    position: { x: 0, y: 0 },
    data: {
      title: c.label,
      subtitle: c.sublabel,
      tone: tone(c.kind),
      avatarShape: c.kind === 'am' ? 'circle' : 'square',
      count: c.count,
      personId: c.person_id,
      accountId: c.account_id,
    },
  };
}

export function buildCompanyGraph(companyNodes: CompanyNode[]): {
  nodes: Node<OrgGraphNodeData>[];
  edges: Edge[];
} {
  const nodes = companyNodes.map(toNode);
  const edges: Edge[] = companyNodes
    .filter((c) => c.parent_id)
    .map((c) => ({
      id: `e:${c.parent_id}->${c.id}`,
      source: c.parent_id as string,
      target: c.id,
      ...EDGE,
    }));
  return layout(nodes, edges);
}
