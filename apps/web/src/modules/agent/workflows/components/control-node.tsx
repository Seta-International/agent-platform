import type { Node } from '@xyflow/react';
import { Handle, type NodeProps, Position } from '@xyflow/react';

interface ControlData extends Record<string, unknown> {
  stepId: string;
  status: string;
  kind: 'sleep' | 'waitForEvent';
  label: string;
}

export function ControlNode({ data }: NodeProps<Node<ControlData>>) {
  return (
    <article
      aria-label={`${data.kind} ${data.stepId}`}
      className="w-[140px] rounded-full border border-dashed bg-[var(--color-surface)] px-3 py-1"
      style={{ borderColor: 'var(--color-hairline-strong)' }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !bg-[var(--color-hairline)]"
      />
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-[var(--color-ink-muted)]">
          {data.kind === 'sleep' ? 'sleep' : 'wait'}
        </span>
        <span className="truncate font-mono text-[10px]" title={data.label}>
          {data.label}
        </span>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !bg-[var(--color-hairline)]"
      />
    </article>
  );
}
