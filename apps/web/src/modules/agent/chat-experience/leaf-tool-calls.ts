export function agentLabel(id: unknown): string {
  if (typeof id !== 'string' || id.length === 0) return 'sub-agent';
  return id
    .replace(/-supervisor$/, '')
    .split('-')
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

export interface LeafToolCall {
  toolCallId: string;
  name: string;
  status: 'running' | 'ok' | 'error';
  via: string;
}

// Tool-call / result / pending entries arrive as `unknown` over the wire and may be either
// chunk-wrapped (`entry.payload.toolName`) or flat (`entry.toolName`). Read both shapes.
function field(entry: unknown, key: string): unknown {
  if (!entry || typeof entry !== 'object') return undefined;
  const e = entry as Record<string, unknown>;
  const payload = e.payload;
  if (payload && typeof payload === 'object') {
    const v = (payload as Record<string, unknown>)[key];
    if (v !== undefined) return v;
  }
  return e[key];
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export function extractLeafToolCalls(content: ReadonlyArray<unknown>): LeafToolCall[] {
  const rows: LeafToolCall[] = [];
  for (const part of content) {
    if (!part || typeof part !== 'object') continue;
    const p = part as { type?: unknown; name?: unknown; data?: unknown };
    if (p.type !== 'data' || p.name !== 'tool-agent') continue;

    const data = (p.data ?? {}) as Record<string, unknown>;
    const via = agentLabel(data.id);

    const statusById = new Map<string, 'ok' | 'error'>();
    for (const r of asArray(data.toolResults)) {
      const id = field(r, 'toolCallId');
      if (typeof id !== 'string' || id.length === 0) continue;
      statusById.set(id, field(r, 'isError') === true ? 'error' : 'ok');
    }

    const seen = new Set<string>();
    for (const c of [...asArray(data.toolCalls), ...asArray(data.pendingToolCalls)]) {
      const id = field(c, 'toolCallId');
      if (typeof id !== 'string' || id.length === 0 || seen.has(id)) continue;
      seen.add(id);
      const nameRaw = field(c, 'toolName');
      const name = typeof nameRaw === 'string' && nameRaw.length > 0 ? nameRaw : 'tool';
      rows.push({ toolCallId: id, name, status: statusById.get(id) ?? 'running', via });
    }
  }
  return rows;
}
