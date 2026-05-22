import type { Node } from '@xyflow/react';
import { Handle, type NodeProps, Position } from '@xyflow/react';
import type { DefaultNodeData } from '../lib/build-graph.ts';
import { stepStatusToRunStatus, tokenFor } from '../lib/status-tokens.ts';
import { ReplayFromStepButton } from './replay-from-step-button.tsx';
import { RunStatusPill } from './run-status-pill.tsx';

export function DefaultNode({ data }: NodeProps<Node<DefaultNodeData>>) {
  const runStatus = stepStatusToRunStatus(data.status);
  const t = tokenFor(runStatus);
  const canReplay = Boolean(data.runStatus && data.onReplay);
  return (
    <article
      aria-label={`Step ${data.stepId} (${runStatus})`}
      className="w-[240px] rounded-md border bg-[var(--color-surface)] px-3 py-2 shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]"
      style={{
        borderColor: data.status === 'running' ? 'var(--color-primary)' : 'var(--color-hairline)',
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !bg-[var(--color-hairline)]"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-xs">{data.stepId}</span>
        <RunStatusPill status={runStatus} />
      </div>
      {data.description ? (
        <p className="mt-1 line-clamp-2 text-xs text-[var(--color-ink-subtle)]">
          {data.description}
        </p>
      ) : null}
      <div aria-hidden className="mt-2 h-0.5 w-full rounded-full" style={{ background: t.bg }} />
      {canReplay && data.runStatus && data.onReplay ? (
        <div className="mt-1 flex justify-end">
          <ReplayFromStepButton
            runStatus={data.runStatus}
            stepStatus={data.status}
            stepId={data.stepId}
            originalPayload={data.originalPayload ?? {}}
            onReplay={data.onReplay}
          />
        </div>
      ) : null}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !bg-[var(--color-hairline)]"
      />
    </article>
  );
}
