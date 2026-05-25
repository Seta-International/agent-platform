import type { PageContext } from './page-context-types';

export interface PageContextPart {
  type: 'data-page-context';
  id: string;
  data: PageContext;
}

export function buildPageContextPart(ctx: PageContext): PageContextPart {
  return { type: 'data-page-context', id: crypto.randomUUID(), data: { ...ctx } };
}

export function isPageContextPart(part: unknown): part is PageContextPart {
  if (!part || typeof part !== 'object') return false;
  const p = part as { type?: unknown; data?: unknown };
  if (p.type !== 'data-page-context') return false;
  const d = p.data as { kind?: unknown; id?: unknown; label?: unknown } | undefined;
  return (
    !!d && typeof d.kind === 'string' && typeof d.id === 'string' && typeof d.label === 'string'
  );
}
