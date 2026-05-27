import { type DataMessagePartComponent, useAuiState } from '@assistant-ui/react';
import { ChatMarkdown } from '@seta/shared-ui';

interface AgentStreamDataShape {
  id?: unknown;
  text?: unknown;
  status?: unknown;
}

function agentLabel(id: unknown): string {
  if (typeof id !== 'string' || id.length === 0) return 'sub-agent';
  return id
    .replace(/-supervisor$/, '')
    .split('-')
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

export const AgentStreamPart: DataMessagePartComponent = ({ data, status }) => {
  const payload = (data ?? {}) as AgentStreamDataShape;
  const text = typeof payload.text === 'string' ? payload.text : '';
  const hasFinalText = useAuiState((s) => {
    const content = s.message.content as ReadonlyArray<unknown>;
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const p = part as { type?: unknown; text?: unknown };
      if (p.type === 'text' && typeof p.text === 'string' && p.text.length > 0) return true;
    }
    return false;
  });
  if (text.length === 0) return null;

  const finished =
    typeof payload.status === 'string' ? payload.status === 'finished' : status.type !== 'running';

  // Once the sub-agent finishes AND the orchestrator has begun emitting its own
  // text-delta echo, collapse to a "view trace" affordance so the answer isn't
  // duplicated. If no text part arrives (no echo), keep the streamed answer
  // visible so the user always sees a response.
  if (finished && hasFinalText) {
    return (
      <details className="my-2 rounded-md border border-hairline bg-surface-2 px-3 py-2 text-caption">
        <summary className="cursor-pointer select-none text-ink-subtle">
          {`Trace · ${agentLabel(payload.id)}`}
        </summary>
        <div className="mt-2 text-ink-muted">
          <ChatMarkdown text={text} />
        </div>
      </details>
    );
  }

  return (
    <div className="relative">
      <ChatMarkdown text={text} />
      <span
        aria-hidden
        className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-[2px] animate-pulse bg-ink"
      />
    </div>
  );
};
