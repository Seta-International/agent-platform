import type { Node } from '@xyflow/react';
import { Handle, type NodeProps, Position } from '@xyflow/react';
import { tokenFor } from '../lib/status-tokens.ts';

interface AfterData extends Record<string, unknown> {
  stepId: string;
  status: string;
}

export function AfterNode({ data }: NodeProps<Node<AfterData>>) {
  const t = tokenFor(data.status);
  return (
    <div
      aria-hidden
      className="grid h-[24px] w-[24px] place-items-center rounded-full"
      style={{ background: 'transparent' }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !bg-[var(--color-hairline)]"
      />
      <span className="size-1.5 rounded-full" style={{ background: t.dot }} />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !bg-[var(--color-hairline)]"
      />
    </div>
  );
}
