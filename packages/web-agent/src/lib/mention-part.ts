/** An `@`-mention resolved from the composer's trigger menu. v1 = people only. */
export interface EntityMention {
  kind: string;
  id: string;
  label: string;
}

export interface EntityMentionPart {
  type: 'data-entity-mention';
  id: string;
  data: EntityMention;
}

/**
 * Mirrors `buildPageContextPart` — the AI SDK v6 wire convention here is
 * `data-<name>` with a minted `id`, not `{ type: 'data', name }`.
 *
 * The orchestrator reads only text (`chat.ts` passes `userText` to
 * `chatOrchestration`), so this part is persisted, not prompted: the model sees
 * the mention through the token's serialized `@Label` text instead.
 */
export function buildMentionPart(mention: EntityMention): EntityMentionPart {
  return { type: 'data-entity-mention', id: crypto.randomUUID(), data: { ...mention } };
}

/** A composer token the user inserted, paired with the entity it resolved to. */
export interface PendingMention {
  /** The token's serialized form — what it becomes in the submitted string. */
  value: string;
  mention: EntityMention;
}

/**
 * Reduce the mentions captured at insertion time to the ones actually present
 * in the submitted text, deduped per entity.
 *
 * Astryx exposes no read path for live composer tokens — `useChatComposerTokens`
 * is consumed internally by `ChatComposerInput` against its own private ref, and
 * `ChatComposerInputHandle.getValue()` returns text with every token already
 * serialized to its `.value`. So the composer logs tokens as they are inserted
 * and reconciles here, which drops any the user deleted before sending.
 */
export function reconcileMentions(
  pending: readonly PendingMention[],
  text: string,
): EntityMention[] {
  const seen = new Set<string>();
  const out: EntityMention[] = [];
  for (const p of pending) {
    if (!text.includes(p.value)) continue;
    const key = `${p.mention.kind}:${p.mention.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p.mention);
  }
  return out;
}

/**
 * Pull the mentions out of a persisted user message's normalized content.
 *
 * Assistant-ui stores a `data-<name>` part as `{ type: 'data', name, data }`
 * (the shape `extractPageContext` reads), so the transcript sees
 * `name: 'entity-mention'`, not the `data-entity-mention` type `buildMentionPart`
 * emits at send time. Defensive on every field.
 */
export function extractMentions(content: ReadonlyArray<unknown>): EntityMention[] {
  const out: EntityMention[] = [];
  for (const part of content) {
    if (!part || typeof part !== 'object') continue;
    const p = part as { type?: unknown; name?: unknown; data?: unknown };
    if (p.type !== 'data' || p.name !== 'entity-mention') continue;
    const d = p.data as { kind?: unknown; id?: unknown; label?: unknown } | undefined;
    if (
      !d ||
      typeof d.kind !== 'string' ||
      typeof d.id !== 'string' ||
      typeof d.label !== 'string'
    ) {
      continue;
    }
    out.push({ kind: d.kind, id: d.id, label: d.label });
  }
  return out;
}

export function isMentionPart(part: unknown): part is EntityMentionPart {
  if (!part || typeof part !== 'object') return false;
  const p = part as { type?: unknown; data?: unknown };
  if (p.type !== 'data-entity-mention') return false;
  const d = p.data as { kind?: unknown; id?: unknown; label?: unknown } | undefined;
  return (
    !!d && typeof d.kind === 'string' && typeof d.id === 'string' && typeof d.label === 'string'
  );
}
