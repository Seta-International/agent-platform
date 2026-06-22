/**
 * Renders an ARIA card payload (the `performance_renderCard` output, surfaced
 * via the persisted data-result part) as a labelled, always-expanded raw-JSON
 * block — so a card is unmistakably a card in the transcript. The agent's
 * accompanying prose still streams as normal text alongside this block.
 *
 * The payload is the `CardPayload` contract from @seta/performance; the frontend
 * treats it opaquely (pretty-prints it) and only reads `card.type` for the label.
 */
export type CardPayload = { type?: string } & Record<string, unknown>;

export function CardJsonBlock({ card }: { card: CardPayload }) {
  return (
    <div className="my-2 rounded-md border border-hairline bg-surface-1 p-3">
      <div className="mb-2 font-medium text-caption text-ink-subtle uppercase tracking-wide">
        Card · {String(card.type ?? 'unknown')}
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words text-caption text-ink">
        {JSON.stringify(card, null, 2)}
      </pre>
    </div>
  );
}
