import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from '@seta/shared-ui';
import type { Node } from '@xyflow/react';
import { Handle, type NodeProps, Position } from '@xyflow/react';
import { useMemo, useState } from 'react';
import type { DefaultNodeData } from '../lib/build-graph.ts';
import { stepStatusToRunStatus, tokenFor } from '../lib/status-tokens.ts';
import { ReplayFromStepButton } from './replay-from-step-button.tsx';
import { RunStatusPill } from './run-status-pill.tsx';

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
        <pre className="m-0 max-h-[60vh] overflow-auto bg-surface-1 px-4 py-3 font-mono text-[11.5px] leading-[1.55] text-ink border-t border-hairline">
          {pretty}
        </pre>
      </DialogContent>
    </Dialog>
  );
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
      {(hasInput || hasOutput || hasError) && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {hasInput && (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-5 px-1.5 text-[10px]"
                onClick={() => setInputOpen(true)}
              >
                Input
              </Button>
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
              <Button
                size="sm"
                variant="ghost"
                className="h-5 px-1.5 text-[10px]"
                onClick={() => setOutputOpen(true)}
              >
                Output
              </Button>
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
              <Button
                size="sm"
                variant="ghost"
                className="h-5 px-1.5 text-[10px] text-semantic-danger hover:text-semantic-danger"
                onClick={() => setErrorOpen(true)}
              >
                Error
              </Button>
              <StepJsonDialog
                title={`${data.stepId} — Error`}
                value={data.stepError}
                open={errorOpen}
                onClose={setErrorOpen}
              />
            </>
          )}
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
