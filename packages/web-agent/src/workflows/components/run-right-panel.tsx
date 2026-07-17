import { Badge, Button, EmptyState, Tab, TabList } from '@seta/shared-ui';
import { Check, ChevronRight, Copy, FileJson } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { WorkflowRunRow } from '../api/schemas.ts';

interface SnapshotShape {
  status?: string;
  context?: Record<string, unknown>;
}

export interface RunRightPanelProps {
  run: WorkflowRunRow;
  streamEvents: unknown[];
  snapshot?: unknown;
}

function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'object' && v !== null && Object.keys(v as object).length === 0) return true;
  return false;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const onClick = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Ignore clipboard permission denials.
    }
  };
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={onClick}
      icon={
        copied ? <Check className="size-3" aria-hidden /> : <Copy className="size-3" aria-hidden />
      }
      label={copied ? 'Copied' : 'Copy'}
    />
  );
}

interface JsonBlockProps {
  value: unknown;
  emptyTitle: string;
  emptyDescription: string;
}

function JsonBlock({ value, emptyTitle, emptyDescription }: JsonBlockProps) {
  const isEmpty = isEmptyValue(value);
  const pretty = useMemo(() => {
    if (isEmpty) return '';
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value, isEmpty]);

  if (isEmpty) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<FileJson className="size-5" />}
          title={emptyTitle}
          description={emptyDescription}
        />
      </div>
    );
  }

  const lineCount = pretty.split('\n').length;
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 flex-none items-center justify-between border-b border-border px-3 text-xs uppercase tracking-wider text-secondary">
        <span>{lineCount} lines</span>
        <CopyButton text={pretty} />
      </div>
      <pre className="m-0 flex-1 overflow-auto whitespace-pre-wrap break-all bg-card p-3 font-mono text-sm leading-[1.55] text-primary">
        {pretty}
      </pre>
    </div>
  );
}

interface StepContextEntry {
  status?: string;
  payload?: unknown;
  output?: unknown;
  error?: unknown;
}

function stepStatusTone(status: string | undefined): 'success' | 'error' | 'warning' | 'neutral' {
  if (!status || status === 'pending') return 'neutral';
  if (status === 'success') return 'success';
  if (status === 'failed') return 'error';
  if (status === 'suspended' || status === 'paused') return 'warning';
  return 'neutral';
}

interface StepRowProps {
  stepId: string;
  entry: StepContextEntry;
}

function StepRow({ stepId, entry }: StepRowProps) {
  const [open, setOpen] = useState(false);
  const statusLabel = entry.status ?? 'pending';
  const tone = stepStatusTone(entry.status);
  const hasOutput = !isEmptyValue(entry.output);
  const hasError = !isEmptyValue(entry.error);
  const hasPayload = !isEmptyValue(entry.payload);
  const hasData = hasOutput || hasError || hasPayload;

  const dataLabel = hasError ? 'Error' : hasOutput ? 'Output' : hasPayload ? 'Input' : null;
  const dataValue = hasError ? entry.error : hasOutput ? entry.output : entry.payload;

  const prettyData = useMemo(() => {
    if (!dataValue) return '';
    try {
      return JSON.stringify(dataValue, null, 2);
    } catch {
      return String(dataValue);
    }
  }, [dataValue]);

  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => hasData && setOpen((v) => !v)}
        disabled={!hasData}
        aria-expanded={hasData ? open : undefined}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-card disabled:cursor-default disabled:hover:bg-transparent"
      >
        <ChevronRight
          aria-hidden
          className={`size-3 flex-none text-disabled transition-transform ${
            open ? 'rotate-90' : ''
          } ${hasData ? '' : 'invisible'}`}
        />
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-primary">{stepId}</span>
        <Badge variant={tone} className="flex-none text-xs" label={statusLabel} />
        {dataLabel && <span className="flex-none text-xs text-disabled">{dataLabel}</span>}
      </button>
      {open && hasData ? (
        <pre className="m-0 max-h-64 overflow-auto whitespace-pre-wrap break-all border-t border-border bg-card px-3 py-2 font-mono text-xs leading-[1.5] text-primary">
          {prettyData}
        </pre>
      ) : null}
    </li>
  );
}

interface CurrentRunTabProps {
  run: WorkflowRunRow;
  snapshot: SnapshotShape | null;
}

function CurrentRunTab({ run, snapshot }: CurrentRunTabProps) {
  const workflowInput = snapshot?.context?.input ?? run.inputSummary ?? null;

  const snapshotContext = snapshot?.context;
  const steps = useMemo<[string, StepContextEntry][]>(() => {
    if (!snapshotContext) return [];
    return Object.entries(snapshotContext)
      .filter(([key]) => key !== 'input' && key !== '__state')
      .map(([key, val]) => [key, (val ?? {}) as StepContextEntry]);
  }, [snapshotContext]);

  const [inputOpen, setInputOpen] = useState(true);

  return (
    <div className="flex h-full flex-col overflow-auto">
      {/* Input section */}
      <section className="flex-none border-b border-border">
        <button
          type="button"
          onClick={() => setInputOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-card"
        >
          <ChevronRight
            aria-hidden
            className={`size-3 flex-none text-disabled transition-transform ${inputOpen ? 'rotate-90' : ''}`}
          />
          <span className="text-xs font-medium uppercase tracking-wider text-secondary">Input</span>
        </button>
        {inputOpen && (
          <div className="max-h-48 overflow-auto border-t border-border">
            {isEmptyValue(workflowInput) ? (
              <p className="px-4 py-3 text-xs text-secondary">No input payload.</p>
            ) : (
              <pre className="m-0 whitespace-pre-wrap break-all bg-card px-3 py-2 font-mono text-xs leading-[1.5] text-primary">
                {(() => {
                  try {
                    return JSON.stringify(workflowInput, null, 2);
                  } catch {
                    return String(workflowInput);
                  }
                })()}
              </pre>
            )}
          </div>
        )}
      </section>

      {/* Steps section */}
      <section className="flex-1">
        <div className="flex h-9 items-center px-3 text-xs font-medium uppercase tracking-wider text-secondary">
          Steps{steps.length > 0 ? ` (${steps.length})` : ''}
        </div>
        {steps.length === 0 ? (
          <div className="px-4 pb-4">
            <EmptyState
              icon={<FileJson className="size-5" />}
              title="No steps yet"
              description="Steps will appear here as the run progresses."
            />
          </div>
        ) : (
          <ul>
            {steps.map(([stepId, entry]) => (
              <StepRow key={stepId} stepId={stepId} entry={entry} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function RunRightPanel({ run, snapshot }: RunRightPanelProps) {
  const snap = (snapshot ?? null) as SnapshotShape | null;
  const [tab, setTab] = useState('current-run');
  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-border bg-body">
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex-none px-3">
          <TabList value={tab} onChange={setTab} size="sm" hasDivider aria-label="Run details">
            <Tab value="current-run" label="Current Run" />
            <Tab value="state" label="State" />
          </TabList>
        </div>
        {tab === 'current-run' && (
          <div className="min-h-0 flex-1 overflow-hidden">
            <CurrentRunTab run={run} snapshot={snap} />
          </div>
        )}
        {tab === 'state' && (
          <div className="min-h-0 flex-1 overflow-hidden">
            <JsonBlock
              value={snap?.context ?? null}
              emptyTitle="No state yet"
              emptyDescription="The workflow hasn't written any context values yet."
            />
          </div>
        )}
      </div>
    </aside>
  );
}
