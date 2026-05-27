import type { Domain } from '@seta/agent-sdk';

const CACHE_TTL_MS = 30 * 60 * 1000;
const VALID_DOMAINS = new Set<string>(['work', 'people', 'self', 'meta', 'knowledge']);

export type RoutingCache = {
  domain: Domain;
  cachedAt: string;
};

export type MemoryStore = {
  getThreadById(q: { threadId: string }): Promise<{
    id: string;
    resourceId: string;
    title?: string | null;
    metadata?: Record<string, unknown>;
  } | null>;
  updateThread(q: {
    id: string;
    title: string;
    metadata: Record<string, unknown>;
  }): Promise<unknown>;
};

export type RoutingCacheLookup = {
  cache: RoutingCache | null;
  threadTitle: string | null;
  existingMetadata: Record<string, unknown>;
};

export function isCacheValid(cache: RoutingCache): boolean {
  const age = Date.now() - new Date(cache.cachedAt).getTime();
  return age < CACHE_TTL_MS;
}

function parseCache(metadata: Record<string, unknown> | undefined): RoutingCache | null {
  const raw = metadata?.routingCache;
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { domain?: unknown; cachedAt?: unknown };
  if (typeof r.domain !== 'string' || typeof r.cachedAt !== 'string') return null;
  if (!VALID_DOMAINS.has(r.domain)) return null;
  return { domain: r.domain as Domain, cachedAt: r.cachedAt };
}

export async function readRoutingCache(
  store: MemoryStore,
  threadId: string,
): Promise<RoutingCacheLookup> {
  try {
    const thread = await store.getThreadById({ threadId });
    if (!thread) return { cache: null, threadTitle: null, existingMetadata: {} };
    const metadata = thread.metadata ?? {};
    const parsed = parseCache(metadata);
    const cache = parsed && isCacheValid(parsed) ? parsed : null;
    return { cache, threadTitle: thread.title ?? null, existingMetadata: metadata };
  } catch {
    return { cache: null, threadTitle: null, existingMetadata: {} };
  }
}

export async function writeRoutingCache(
  store: MemoryStore,
  threadId: string,
  domain: Domain,
  ctx: { existingMetadata: Record<string, unknown>; threadTitle: string | null },
): Promise<void> {
  try {
    const entry: RoutingCache = { domain, cachedAt: new Date().toISOString() };
    await store.updateThread({
      id: threadId,
      title: ctx.threadTitle ?? '',
      metadata: { ...ctx.existingMetadata, routingCache: entry },
    });
  } catch (e) {
    console.warn('[routing-cache] write failed, continuing without cache', e);
  }
}
