import {
  Badge,
  Button,
  EmptyState,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@seta/shared-ui';
import { Check, ChevronRight, Copy, FileJson, Inbox } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { WorkflowRunRow } from '../api/schemas.ts';
import type { WorkflowRunStreamEvent } from '../hooks/use-workflow-run.ts';

interface SnapshotShape {
  status?: string;
  context?: Record<string, unknown>;
}

export interface RunRightPanelProps {
  run: WorkflowRunRow;
  streamEvents: WorkflowRunStreamEvent[];
  snapshot?: unknown;
}

type ChipTone = 'success' | 'destructive' | 'warning' | 'default' | 'secondary';

const LIFECYCLE_LABEL: Record<string, { label: string; tone: ChipTone }> = {
  'run-started': { label: 'Started', tone: 'default' },
  'run-completed': { label: 'Completed', tone: 'success' },
  'run-failed': { label: 'Failed', tone: 'destructive' },
  'run-tripwired': { label: 'Tripwired', tone: 'destructive' },
  'run-canceled': { label: 'Canceled', tone: 'destructive' },
  'run-suspended': { label: 'Suspended', tone: 'warning' },
  'run-resumed': { label: 'Resumed', tone: 'default' },
};

function chipToneFor(kind: string): ChipTone {
  if (kind in LIFECYCLE_LABEL) return LIFECYCLE_LABEL[kind]?.tone ?? 'secondary';
  if (kind.includes('step') && kind.includes('completed')) return 'success';
  if (kind.includes('error') || kind.includes('failed')) return 'destructive';
  if (kind.includes('suspended') || kind.includes('paused')) return 'warning';
  return 'secondary';
}

function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'object' && v !== null && Object.keys(v as object).length === 0) return true;
  return false;
}

function payloadPreview(payload: unknown): string {
  if (payload === null || payload === undefined) return '';
  if (typeof payload === 'string') return payload;
  try {
    const s = JSON.stringify(payload);
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  } catch {
    return String(payload);
  }
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
    <Button size="sm" variant="ghost" onClick={onClick} aria-label="Copy to clipboard">
      {copied ? (
        <>
          <Check className="size-3" aria-hidden /> Copied
        </>
      ) : (
        <>
          <Copy className="size-3" aria-hidden /> Copy
        </>
      )}
    </Button>
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
      <div className="flex h-9 flex-none items-center justify-between border-b border-hairline px-3 text-[11px] uppercase tracking-wider text-ink-subtle">
        <span>{lineCount} lines</span>
        <CopyButton text={pretty} />
      </div>
      <pre className="m-0 flex-1 overflow-auto whitespace-pre bg-surface-1 p-3 font-mono text-[11.5px] leading-[1.55] text-ink">
        {pretty}
      </pre>
    </div>
  );
}

interface LogRowProps {
  event: WorkflowRunStreamEvent;
}

function LogRow({ event }: LogRowProps) {
  const [open, setOpen] = useState(false);
  const tone = chipToneFor(event.kind);
  const preview = payloadPreview(event.payload);
  const hasPayload = event.payload !== null && event.payload !== undefined;
  const pretty = hasPayload
    ? (() => {
        try {
          return JSON.stringify(event.payload, null, 2);
        } catch {
          return String(event.payload);
        }
      })()
    : '';

  return (
    <li className="border-b border-hairline-tertiary last:border-b-0">
      <button
        type="button"
        onClick={() => hasPayload && setOpen((v) => !v)}
        disabled={!hasPayload}
        aria-expanded={hasPayload ? open : undefined}
        className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-1 disabled:cursor-default disabled:hover:bg-transparent"
      >
        <ChevronRight
          aria-hidden
          className={`mt-1 size-3 flex-none text-ink-tertiary transition-transform ${
            open ? 'rotate-90' : ''
          } ${hasPayload ? '' : 'invisible'}`}
        />
        <span className="w-8 flex-none pt-0.5 font-mono text-[11px] text-ink-tertiary tabular-nums">
          {event.seq}
        </span>
        <Badge variant={tone} className="flex-none">
          {event.kind}
        </Badge>
        <span className="min-w-0 flex-1 truncate pt-0.5 font-mono text-[11.5px] text-ink-muted">
          {preview}
        </span>
      </button>
      {open && hasPayload ? (
        <pre className="m-0 max-h-72 overflow-auto border-t border-hairline-tertiary bg-surface-1 px-3 py-2 font-mono text-[11px] leading-[1.5] text-ink">
          {pretty}
        </pre>
      ) : null}
    </li>
  );
}

interface LogsTabProps {
  events: WorkflowRunStreamEvent[];
  liveRun: boolean;
}

function LogsTab({ events, liveRun }: LogsTabProps) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return events;
    return events.filter((e) => {
      if (e.kind.toLowerCase().includes(q)) return true;
      return payloadPreview(e.payload).toLowerCase().includes(q);
    });
  }, [events, search]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 flex-none items-center justify-between gap-2 border-b border-hairline px-3">
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by kind or payload…"
          aria-label="Filter logs"
          className="h-7 flex-1 text-xs"
        />
        <span className="text-[11px] tabular-nums text-ink-subtle">
          {filtered.length}/{events.length}
        </span>
      </div>
      {events.length === 0 ? (
        <div className="p-6">
          <EmptyState
            icon={<Inbox className="size-5" />}
            title={liveRun ? 'Waiting for events…' : 'No events recorded'}
            description={
              liveRun
                ? 'Events will stream in here as the run progresses.'
                : 'This run completed without emitting any stream events.'
            }
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-6 text-center text-xs text-ink-subtle">No events match that filter.</div>
      ) : (
        <ul className="flex-1 overflow-auto">
          {filtered.map((e) => (
            <LogRow key={e.seq} event={e} />
          ))}
        </ul>
      )}
    </div>
  );
}

interface EventsTabProps {
  events: WorkflowRunStreamEvent[];
}

function EventsTab({ events }: EventsTabProps) {
  const lifecycle = useMemo(() => events.filter((e) => e.kind.startsWith('run-')), [events]);
  if (lifecycle.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<Inbox className="size-5" />}
          title="No lifecycle events yet"
          description="Run-level events (started, suspended, completed, …) will appear here."
        />
      </div>
    );
  }
  return (
    <ol className="relative px-4 py-3">
      <span aria-hidden className="absolute bottom-3 left-[19px] top-3 w-px bg-hairline-tertiary" />
      {lifecycle.map((e) => {
        const meta = LIFECYCLE_LABEL[e.kind] ?? { label: e.kind, tone: 'secondary' as ChipTone };
        return (
          <li key={e.seq} className="relative flex items-start gap-3 py-1.5 pl-1">
            <span
              aria-hidden
              className={`relative z-10 mt-1.5 size-2 flex-none rounded-full ${dotClass(meta.tone)} ring-2 ring-canvas`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-body-sm font-medium text-ink">{meta.label}</span>
                <span className="font-mono text-[10px] text-ink-tertiary">#{e.seq}</span>
              </div>
              <p className="truncate font-mono text-[11px] text-ink-subtle">{e.kind}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function dotClass(tone: ChipTone): string {
  switch (tone) {
    case 'success':
      return 'bg-semantic-success';
    case 'destructive':
      return 'bg-semantic-danger';
    case 'warning':
      return 'bg-semantic-warning';
    case 'default':
      return 'bg-primary';
    default:
      return 'bg-ink-tertiary';
  }
}

const ACTIVE_RUN_STATUSES = new Set(['pending', 'running', 'paused']);

export function RunRightPanel({ run, streamEvents, snapshot }: RunRightPanelProps) {
  const snap = (snapshot ?? null) as SnapshotShape | null;
  const liveRun = ACTIVE_RUN_STATUSES.has(run.status);
  return (
    <aside className="hidden w-[380px] shrink-0 flex-col border-l border-hairline bg-canvas lg:flex">
      <Tabs defaultValue="logs" className="flex h-full min-h-0 flex-col">
        <TabsList className="h-11 flex-none gap-0 px-3">
          <TabsTrigger value="logs" className="px-3 py-2 text-xs">
            Logs
          </TabsTrigger>
          <TabsTrigger value="events" className="px-3 py-2 text-xs">
            Events
          </TabsTrigger>
          <TabsTrigger value="input" className="px-3 py-2 text-xs">
            Input
          </TabsTrigger>
          <TabsTrigger value="state" className="px-3 py-2 text-xs">
            State
          </TabsTrigger>
        </TabsList>
        <TabsContent value="logs" className="mt-0 min-h-0 flex-1 overflow-hidden">
          <LogsTab events={streamEvents} liveRun={liveRun} />
        </TabsContent>
        <TabsContent value="events" className="mt-0 min-h-0 flex-1 overflow-auto">
          <EventsTab events={streamEvents} />
        </TabsContent>
        <TabsContent value="input" className="mt-0 min-h-0 flex-1 overflow-hidden">
          <JsonBlock
            value={run.inputSummary}
            emptyTitle="No input"
            emptyDescription="This run was triggered without an input payload."
          />
        </TabsContent>
        <TabsContent value="state" className="mt-0 min-h-0 flex-1 overflow-hidden">
          <JsonBlock
            value={snap?.context ?? null}
            emptyTitle="No state yet"
            emptyDescription="The workflow hasn't written any context values yet."
          />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
