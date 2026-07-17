import { Dialog, DialogHeader, Layout, LayoutContent, Spinner } from '@seta/shared-ui';
import type { Node } from '@xyflow/react';
import { Handle, type NodeProps, Position } from '@xyflow/react';
import { Ban, Check, CircleDashed, PauseCircle, ShieldAlert, X } from 'lucide-react';
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
    <Dialog isOpen={open} onOpenChange={onClose} width={720} purpose="info">
      <Layout
        header={<DialogHeader title={title} onOpenChange={onClose} />}
        content={
          <LayoutContent padding={0}>
            <pre className="m-0 max-h-[60vh] overflow-auto whitespace-pre-wrap break-all bg-card px-4 py-3 font-mono text-[11.5px] leading-[1.55] text-primary border-t border-border">
              {pretty}
            </pre>
          </LayoutContent>
        }
      />
    </Dialog>
  );
}

function StatusIcon({ status }: { status: string }) {
  const cls = 'size-3.5 flex-none';
  switch (status) {
    case 'success':
      return <Check className={`${cls} text-[var(--color-success)]`} />;
    case 'failed':
      return <X className={`${cls} text-[var(--color-error)]`} />;
    case 'running':
      // size="md" is 14px, matching the size-3.5 of the sibling status icons.
      return <Spinner size="md" className="flex-none" />;
    case 'paused':
    case 'suspended':
      return <PauseCircle className={`${cls} text-[var(--color-warning)]`} />;
    case 'tripwire':
      return <ShieldAlert className={`${cls} text-[var(--color-warning)]`} />;
    case 'canceled':
      return <Ban className={`${cls} text-[var(--color-text-disabled)]`} />;
    default:
      return <CircleDashed className={`${cls} text-[var(--color-text-disabled)]`} />;
  }
}

function nodeBorderColor(runStatus: string): string {
  switch (runStatus) {
    case 'running':
      return 'var(--color-accent)';
    case 'success':
      return 'var(--color-success)';
    case 'failed':
      return 'var(--color-error)';
    case 'paused':
    case 'tripwire':
      return 'var(--color-warning)';
    default:
      return 'var(--color-border)';
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
      className="w-[280px] overflow-hidden rounded-md border bg-[var(--color-background-card)] shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
      style={{ borderColor: nodeBorderColor(runStatus) }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !bg-[var(--color-border)]"
      />

      {/* Header */}
      <div className="flex items-start gap-2 px-3 pt-2.5 pb-1.5">
        <StatusIcon status={runStatus} />
        <div className="min-w-0 flex-1">
          <span className="block truncate font-mono text-xs font-medium text-[var(--color-text-primary)]">
            {data.stepId}
          </span>
          {data.description ? (
            <p className="mt-0.5 line-clamp-3 text-[11px] leading-[1.4] text-[var(--color-text-secondary)]">
              {data.description}
            </p>
          ) : null}
        </div>
      </div>

      {/* Status bar */}
      <div aria-hidden className="h-0.5 w-full" style={{ background: t.bg }} />
      {hasActions && (
        <div
          className="flex items-center gap-1 border-t border-[var(--color-border)] px-2 py-1.5"
          style={{ background: 'var(--color-background-surface)' }}
        >
          <div className="flex min-w-0 flex-1 items-center gap-1">
            {hasInput && (
              <>
                <button
                  type="button"
                  className="rounded border border-[var(--color-border)] px-2 py-0.5 text-xs hover:bg-[var(--color-background-card)]"
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
                  className="rounded border border-[var(--color-border)] px-2 py-0.5 text-xs hover:bg-[var(--color-background-card)]"
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
                  className="rounded border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-error)] hover:bg-[var(--color-background-card)]"
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
        className="!h-2 !w-2 !bg-[var(--color-border)]"
      />
    </article>
  );
}
