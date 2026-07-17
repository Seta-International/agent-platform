import type { Node } from '@xyflow/react';
import { Handle, type NodeProps, Position } from '@xyflow/react';
import { tokenFor } from '../lib/status-tokens.ts';

interface LoopData extends Record<string, unknown> {
  stepId: string;
  status: string;
  predicate: string;
}

export function LoopResultNode({ data }: NodeProps<Node<LoopData>>) {
  const t = tokenFor(data.status);
  return (
    <article
      aria-label={`Loop ${data.stepId} (${data.status})`}
      className="w-[260px] rounded-lg border-2 border-dashed bg-[var(--color-background-card)] px-3 py-2"
      style={{ borderColor: 'var(--color-border-emphasized)' }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !bg-[var(--color-border)]"
      />
      <div className="flex items-center gap-1.5">
        <span aria-hidden className="size-1.5 rounded-full" style={{ background: t.dot }} />
        <span className="truncate font-mono text-xs">{data.stepId}</span>
        <span className="ml-auto rounded bg-[var(--color-background-surface)] px-1.5 py-0.5 text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
          loop
        </span>
      </div>
      <p
        className="mt-1 truncate text-xs text-[var(--color-text-secondary)]"
        title={data.predicate}
      >
        until {data.predicate || '—'}
      </p>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !bg-[var(--color-border)]"
      />
    </article>
  );
}
