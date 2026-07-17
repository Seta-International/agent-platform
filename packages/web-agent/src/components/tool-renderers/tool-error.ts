/**
 * Extracts a human-readable message from a tool error, defensively — the source
 * is `unknown` (a tool-returned `result` when `isError`, or an aborted run's
 * `status.error`) and may be a string, an Error-like `{ message }`, a domain
 * `{ error | reason | detail }`, or a nested `{ error: { message } }`. Anything
 * unrecognized is compactly stringified; empty/absent sources fall back to
 * `'failed'` (the old hardcoded behaviour, now only the last resort).
 */
export function toolErrorMessage(source: unknown): string {
  const text = extract(source);
  return text && text.trim().length > 0 ? text.trim() : 'failed';
}

function extract(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return String(value);

  const obj = value as Record<string, unknown>;
  for (const key of ['message', 'error', 'reason', 'detail']) {
    const field = obj[key];
    if (typeof field === 'string' && field.trim().length > 0) return field;
    // e.g. { error: { message: '…' } }
    if (field && typeof field === 'object') {
      const nested = (field as Record<string, unknown>).message;
      if (typeof nested === 'string' && nested.trim().length > 0) return nested;
    }
  }
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}
