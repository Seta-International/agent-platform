// Subset of the @seta/agent-sdk ApprovalCard shape the chat/run cards render.
// We accept `unknown` proposedPayload and type-narrow here so a stale or
// malformed payload degrades gracefully instead of crashing the surface.
export interface CandidateRowShape {
  id: string;
  label: string;
  secondary?: string;
  score?: number;
}

export interface ApprovalCardShape {
  intent?: string;
  summary?: string;
  details?: Array<{ kind: string; items?: CandidateRowShape[] }>;
  primary?: { label: string; argsPatch?: Record<string, unknown> };
  alternates?: Array<{ label: string; argsPatch?: Record<string, unknown> }>;
  decline?: { label: string; argsPatch?: Record<string, unknown> };
}

export function asCard(payload: unknown): ApprovalCardShape | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as ApprovalCardShape;
  return p.intent || p.primary || p.details ? p : null;
}

/**
 * Detects dedup-style cards: alternates have `kind: 'link'` in argsPatch,
 * as opposed to staffing cards that have `assigneeUserIds`.
 */
export function isDedupCard(card: ApprovalCardShape): boolean {
  return (
    (card.alternates ?? []).some((a) => (a.argsPatch as { kind?: string })?.kind === 'link') ||
    (card.primary?.argsPatch as { kind?: string })?.kind === 'leave'
  );
}

export function isDedupApprovalPayload(payload: unknown): boolean {
  const c = asCard(payload);
  return c ? isDedupCard(c) : false;
}
