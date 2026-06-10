/** If a user text part is an injected `Context:` block, return the attached
 *  filenames (for chip rendering); otherwise null. */
export function parseContextAttachment(text: string): string[] | null {
  if (!text.startsWith('Context:\n<<<FILE:')) return null;
  const names = [...text.matchAll(/<<<FILE:\s*(.+?)>>>/g)].map((m) => m[1]?.trim());
  return names.length > 0 ? names : null;
}
