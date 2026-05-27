import type { Node } from '@xyflow/react';
import { Handle, type NodeProps, Position } from '@xyflow/react';
import { tokenFor } from '../lib/status-tokens.ts';

interface NestedData extends Record<string, unknown> {
  stepId: string;
  status: string;
  workflowName: string;
  childSnapshot: unknown;
}

export function NestedNode({ data }: NodeProps<Node<NestedData>>) {
  const t = tokenFor(data.status);
  return (
    <article
      aria-label={`Nested workflow ${data.workflowName} (${data.status})`}
      className="w-[280px] rounded-md border-2 bg-[var(--color-surface)] px-3 py-2 shadow-sm"
      style={{
        borderColor: 'var(--color-hairline-strong)',
        boxShadow: 'inset 0 0 0 1px var(--color-hairline)',
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !bg-[var(--color-hairline)]"
      />
      <div className="flex items-center gap-1.5">
        <span aria-hidden className="size-1.5 rounded-full" style={{ background: t.dot }} />
        <span className="truncate text-xs font-medium">{data.workflowName}</span>
        <span className="ml-auto rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-ink-muted)]">
          sub
        </span>
      </div>
      <p className="mt-1 truncate font-mono text-[10px] text-[var(--color-ink-subtle)]">
        {data.stepId}
      </p>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !bg-[var(--color-hairline)]"
      />
    </article>
  );
}
