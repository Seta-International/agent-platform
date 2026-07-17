import { type DataMessagePartComponent, useAuiState } from '@assistant-ui/react';
import { Collapsible, Markdown } from '@seta/shared-ui';
import { agentLabel } from './leaf-tool-calls';

interface AgentStreamDataShape {
  id?: unknown;
  text?: unknown;
  status?: unknown;
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
    // `defaultIsOpen={false}` is load-bearing: Astryx `Collapsible` defaults to
    // OPEN, the inverse of the <details> it replaces. Without it the duplicated
    // sub-agent answer this branch exists to hide would render expanded.
    return (
      <Collapsible defaultIsOpen={false} trigger={`Trace · ${agentLabel(payload.id)}`}>
        <Markdown density="compact" autolink="gfm">
          {text}
        </Markdown>
      </Collapsible>
    );
  }

  return (
    <div className="relative">
      <Markdown density="compact" autolink="gfm">
        {text}
      </Markdown>
      <span
        aria-hidden
        className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-[2px] animate-pulse bg-ink"
      />
    </div>
  );
};
