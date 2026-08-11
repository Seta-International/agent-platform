import type { Edge, Node } from '@xyflow/react';
import type { CompanyNode } from '../../api/org-client.ts';
import { EDGE, layout, type OrgGraphNodeData, type OrgNodeEntity } from './graph-layout.ts';

export type { OrgGraphNodeData } from './graph-layout.ts';

function entityOf(kind: CompanyNode['kind']): OrgNodeEntity {
  if (kind === 'am') return 'person';
  if (kind === 'account') return 'account';
  return 'department';
}

function toNode(c: CompanyNode): Node<OrgGraphNodeData> {
  const entity = entityOf(c.kind);
  // Executive carries the brand-primary emphasis; everything else is a clean surface card whose
  // type reads from its accent rail + icon.
  const tone: OrgGraphNodeData['tone'] = c.kind === 'executive' ? 'primary' : 'surface';
  // Navigation: the Delivery unit drills to the Account view; an account box opens that account.
  const nav: OrgGraphNodeData['nav'] =
    c.kind === 'delivery'
      ? { view: 'account' }
      : c.kind === 'account' && c.account_id
        ? { view: 'account', accountId: c.account_id }
        : c.kind !== 'am'
          ? { view: 'department', deptId: c.id.replace(/^unit:/, '') }
          : undefined;
  return {
    id: c.id,
    type: 'org',
    position: { x: 0, y: 0 },
    data: {
      title: c.label,
      subtitle: c.sublabel,
      tone,
      avatarSrc: c.photo_url ?? undefined,
      avatarShape: entity === 'person' ? 'circle' : 'square',
      entity,
      count: c.count,
      personId: c.person_id,
      nav,
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
