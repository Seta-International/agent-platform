import { GraphNodeCard } from '@seta/shared-ui';
import { Handle, type Node, type NodeProps, Position } from '@xyflow/react';
import { Boxes, Briefcase, Building2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { NODE_W, type OrgGraphNodeData } from './graph-layout.ts';

// Per-type glyph + accent rail. Person nodes keep their name-initials avatar (icon undefined).
function visualFor(data: OrgGraphNodeData): { icon?: ReactNode; accent?: string } {
  switch (data.entity) {
    case 'department':
      return {
        icon: <Building2 />,
        accent: data.tone === 'primary' ? 'var(--color-accent)' : 'var(--color-text-secondary)',
      };
    case 'account':
      return { icon: <Briefcase />, accent: 'var(--color-icon-teal)' };
    case 'project':
      return { icon: <Boxes />, accent: 'var(--color-warning)' };
    default:
      return {};
  }
}

export function OrgGraphNode({ data }: NodeProps<Node<OrgGraphNodeData>>) {
  if (data.entity === 'empty') {
    return (
      <>
        <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
        <div
          style={{
            width: NODE_W,
            padding: '18px 0',
            textAlign: 'center',
            fontSize: 13,
            fontStyle: 'italic',
            color: 'var(--color-text-secondary)',
          }}
        >
          {data.title}
        </div>
        <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      </>
    );
  }

  const { icon, accent } = visualFor(data);
  return (
    <>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <GraphNodeCard
        title={data.title}
        subtitle={data.subtitle}
        tone={data.tone}
        avatarSrc={data.avatarSrc}
        avatarShape={data.avatarShape}
        icon={icon}
        accent={accent}
        count={data.count}
        interactive={Boolean(data.personId || data.nav)}
      />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </>
  );
}
