/** Compact one-line summary of a tool call's arguments, e.g. `query: infra, limit: 5`. */
export function summarizeArgs(args: unknown): string | undefined {
  if (!args || typeof args !== 'object') return undefined;
  const formatValue = (v: unknown): string => {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (Array.isArray(v)) return v.map(formatValue).filter(Boolean).join('/');
    return JSON.stringify(v);
  };
  const parts = Object.entries(args as Record<string, unknown>)
    .map(([k, v]) => {
      const val = formatValue(v);
      return val ? `${k}: ${val}` : '';
    })
    .filter(Boolean);
  if (parts.length === 0) return undefined;
  const text = parts.join(', ');
  return text.length > 80 ? `${text.slice(0, 79)}…` : text;
}
