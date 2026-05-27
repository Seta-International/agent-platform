import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@seta/shared-ui';
import type { Node } from '@xyflow/react';
import { Handle, type NodeProps, Position } from '@xyflow/react';
import { Ban, Check, CircleDashed, Loader2, PauseCircle, ShieldAlert, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { DefaultNodeData } from '../lib/build-graph.ts';
import { stepStatusToRunStatus, tokenFor } from '../lib/status-tokens.ts';
import { ReplayFromStepButton } from './replay-from-step-button.tsx';

function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'object' && v !== null && Object.keys(v as object).length === 0) return true;
  return false;
}

interface StepJsonDialogProps {
  title: string;
  value: unknown;
  open: boolean;
  onClose: (open: boolean) => void;
}

function StepJsonDialog({ title, value, open, onClose }: StepJsonDialogProps) {
  const pretty = useMemo(() => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-full p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="font-mono text-sm">{title}</DialogTitle>
        </DialogHeader>
        <pre className="m-0 max-h-[60vh] overflow-auto whitespace-pre-wrap break-all bg-surface-1 px-4 py-3 font-mono text-[11.5px] leading-[1.55] text-ink border-t border-hairline">
          {pretty}
        </pre>
      </DialogContent>
    </Dialog>
  );
}

function StatusIcon({ status }: { status: string }) {
  const cls = 'size-3.5 flex-none';
  switch (status) {
    case 'success':
      return <Check className={`${cls} text-[var(--color-semantic-success)]`} />;
    case 'failed':
      return <X className={`${cls} text-[var(--color-destructive)]`} />;
    case 'running':
      return <Loader2 className={`${cls} animate-spin text-[var(--color-primary)]`} />;
    case 'paused':
    case 'suspended':
      return <PauseCircle className={`${cls} text-[var(--color-semantic-warning)]`} />;
    case 'tripwire':
      return <ShieldAlert className={`${cls} text-[var(--color-semantic-warning)]`} />;
    case 'canceled':
      return <Ban className={`${cls} text-[var(--color-ink-tertiary)]`} />;
    default:
      return <CircleDashed className={`${cls} text-[var(--color-ink-tertiary)]`} />;
  }
}

function nodeBorderColor(runStatus: string): string {
  switch (runStatus) {
    case 'running':
      return 'var(--color-primary)';
    case 'success':
      return 'var(--color-semantic-success)';
    case 'failed':
      return 'var(--color-destructive)';
    case 'paused':
    case 'tripwire':
      return 'var(--color-semantic-warning)';
    default:
      return 'var(--color-hairline)';
  }
}

export function DefaultNode({ data }: NodeProps<Node<DefaultNodeData>>) {
  const runStatus = stepStatusToRunStatus(data.status);
  const t = tokenFor(runStatus);
  const canReplay = Boolean(data.runStatus && data.onReplay);

  const [inputOpen, setInputOpen] = useState(false);
  const [outputOpen, setOutputOpen] = useState(false);
  const [errorOpen, setErrorOpen] = useState(false);

  const hasInput = !isEmptyValue(data.stepInput);
  const hasOutput = !isEmptyValue(data.stepOutput);
  const hasError = !isEmptyValue(data.stepError);
  const hasActions = hasInput || hasOutput || hasError || canReplay;

  return (
    <article
      aria-label={`Step ${data.stepId} (${runStatus})`}
      className="w-[280px] overflow-hidden rounded-md border bg-[var(--color-surface-1)] shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]"
      style={{ borderColor: nodeBorderColor(runStatus) }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !bg-[var(--color-hairline)]"
      />

      {/* Header */}
      <div className="flex items-start gap-2 px-3 pt-2.5 pb-1.5">
        <StatusIcon status={runStatus} />
        <div className="min-w-0 flex-1">
          <span className="block truncate font-mono text-xs font-medium text-[var(--color-ink)]">
            {data.stepId}
          </span>
          {data.description ? (
            <p className="mt-0.5 line-clamp-3 text-[11px] leading-[1.4] text-[var(--color-ink-subtle)]">
              {data.description}
            </p>
          ) : null}
        </div>
      </div>

      {/* Status bar */}
      <div aria-hidden className="h-0.5 w-full" style={{ background: t.bg }} />
      {hasActions && (
        <div
          className="flex items-center gap-1 border-t border-[var(--color-hairline)] px-2 py-1.5"
          style={{ background: 'var(--color-surface-2)' }}
        >
          <div className="flex min-w-0 flex-1 items-center gap-1">
            {hasInput && (
              <>
                <button
                  type="button"
                  className="rounded border border-[var(--color-hairline)] px-2 py-0.5 text-xs hover:bg-[var(--color-surface-1)]"
                  onClick={() => setInputOpen(true)}
                >
                  Input
                </button>
                <StepJsonDialog
                  title={`${data.stepId} — Input`}
                  value={data.stepInput}
                  open={inputOpen}
                  onClose={setInputOpen}
                />
              </>
            )}
            {hasOutput && (
              <>
                <button
                  type="button"
                  className="rounded border border-[var(--color-hairline)] px-2 py-0.5 text-xs hover:bg-[var(--color-surface-1)]"
                  onClick={() => setOutputOpen(true)}
                >
                  Output
                </button>
                <StepJsonDialog
                  title={`${data.stepId} — Output`}
                  value={data.stepOutput}
                  open={outputOpen}
                  onClose={setOutputOpen}
                />
              </>
            )}
            {hasError && (
              <>
                <button
                  type="button"
                  className="rounded border border-[var(--color-hairline)] px-2 py-0.5 text-xs text-[var(--color-destructive)] hover:bg-[var(--color-surface-1)]"
                  onClick={() => setErrorOpen(true)}
                >
                  Error
                </button>
                <StepJsonDialog
                  title={`${data.stepId} — Error`}
                  value={data.stepError}
                  open={errorOpen}
                  onClose={setErrorOpen}
                />
              </>
            )}
          </div>
          {canReplay && data.runStatus && data.onReplay ? (
            <ReplayFromStepButton
              runStatus={data.runStatus}
              stepStatus={data.status}
              stepId={data.stepId}
              originalPayload={data.originalPayload ?? {}}
              onReplay={data.onReplay}
            />
          ) : null}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !bg-[var(--color-hairline)]"
      />
    </article>
  );
}
