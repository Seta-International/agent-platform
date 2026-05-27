import type { Node } from '@xyflow/react';
import { Handle, type NodeProps, Position } from '@xyflow/react';
import type { ConditionNodeData } from '../lib/build-graph.ts';
import { tokenFor } from '../lib/status-tokens.ts';

export function ConditionNode({ data }: NodeProps<Node<ConditionNodeData>>) {
  const t = tokenFor(data.status);
  return (
    <article
      aria-label={`Condition ${data.stepId} (${data.status})`}
      className="w-[180px] rounded-md border border-dashed bg-[var(--color-surface-1)] px-3 py-2 shadow-sm"
      style={{ borderColor: 'var(--color-hairline-strong)' }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !bg-[var(--color-hairline)]"
      />
      <div className="flex items-center gap-1.5">
        <span aria-hidden className="size-1.5 rounded-full" style={{ background: t.dot }} />
        <span className="truncate font-mono text-xs">{data.stepId}</span>
      </div>
      <ul className="mt-1 space-y-0.5 text-[10px] text-[var(--color-ink-subtle)]">
        {data.predicates.slice(0, 3).map((p, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: branches are positionally ordered in the workflow definition; index IS the stable identity
          <li key={i} className="truncate" title={p}>
            {p || '—'}
          </li>
        ))}
        {data.predicates.length > 3 ? <li>+{data.predicates.length - 3} more</li> : null}
      </ul>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !bg-[var(--color-hairline)]"
      />
    </article>
  );
}
