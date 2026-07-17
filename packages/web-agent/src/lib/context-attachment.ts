/** If a user text part is an injected `Context:` attachment block, return the
 *  attached filenames (for chip rendering); otherwise null.
 *
 *  The `<<<FILE:` sentinel is the wire format Mastra replays on follow-ups — it
 *  is intentionally text and MUST NOT change here. This parser only reads it,
 *  defensively: non-string input, and empty/whitespace-only names, yield null. */
export function parseContextAttachment(text: string): string[] | null {
  if (typeof text !== 'string' || !text.startsWith('Context:\n<<<FILE:')) return null;
  const names: string[] = [];
  // `[^>]+?` keeps a match inside one sentinel (never spans a `>`); the trailing
  // `\s*>>>` + trim drop padding. No capture is asserted non-null — an empty or
  // whitespace-only name is filtered rather than emitted.
  for (const match of text.matchAll(/<<<FILE:\s*([^>]+?)\s*>>>/g)) {
    const name = match[1]?.trim();
    if (name) names.push(name);
  }
  return names.length > 0 ? names : null;
}
