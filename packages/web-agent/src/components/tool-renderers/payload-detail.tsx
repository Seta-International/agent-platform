import type { ReactNode } from 'react';

/**
 * Builds the expandable body for a tool-call row from its raw result payload.
 *
 * Astryx `ChatToolCalls` shows `resultDetail` behind the row's own chevron and
 * only renders the affordance when it is non-null — which is what preserves the
 * old `expandable = payload != null` behaviour: no payload, no chevron.
 */
export function payloadDetail(payload: unknown): ReactNode | undefined {
  if (payload == null) return undefined;
  return (
    <pre className="max-h-64 max-w-full overflow-auto rounded-md border border-border bg-surface px-2.5 py-2 font-mono text-[11px] leading-relaxed text-secondary">
      {JSON.stringify(payload, null, 2)}
    </pre>
  );
}
