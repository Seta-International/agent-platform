import type { Domain } from '@seta/copilot-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoutingCacheLookup } from '../../src/backend/routing-cache.ts';

vi.mock('../../src/backend/domain-classifier.ts', () => ({
  classifyDomain: vi.fn(),
  initClassifier: vi.fn().mockResolvedValue(undefined),
}));

import { classifyDomain } from '../../src/backend/domain-classifier.ts';
import { selectAgent } from '../../src/backend/routing-fast-path.ts';

function fakeAgent(id: string) {
  return { id, stream: vi.fn().mockResolvedValue({ stream: 'ok' }) } as never;
}

const THREAD_ID = 'thread-abc';
const USER_TEXT = 'list my tasks';

function noCache(): RoutingCacheLookup {
  return { cache: null, threadTitle: null, existingMetadata: {} };
}

function withCache(domain: Domain): RoutingCacheLookup {
  return {
    cache: { domain, cachedAt: new Date().toISOString() },
    threadTitle: 'My Thread',
    existingMetadata: { routingCache: { domain, cachedAt: new Date().toISOString() } },
  };
}

const topAgent = fakeAgent('top-supervisor');
const domainAgents = {
  work: fakeAgent('work-supervisor'),
  people: fakeAgent('people-supervisor'),
  self: fakeAgent('self-supervisor'),
  meta: fakeAgent('meta-supervisor'),
  knowledge: fakeAgent('knowledge-supervisor'),
};

describe('selectAgent', () => {
  beforeEach(() => vi.clearAllMocks());

  // ─── No threadId ──────────────────────────────────────────────────────────

  it('no threadId → topAgent, no cache write, classifier never called', async () => {
    const { agent, shouldWriteCache } = await selectAgent({
      threadId: undefined,
      userText: USER_TEXT,
      topAgent,
      domainAgents,
      lookup: noCache(),
    });
    expect(agent).toBe(topAgent);
    expect(shouldWriteCache).toBe(false);
    expect(classifyDomain).not.toHaveBeenCalled();
  });

  // ─── Cache hit ────────────────────────────────────────────────────────────

  it('cache hit → returns cached domain agent immediately, classifier NOT called', async () => {
    const { agent, shouldWriteCache } = await selectAgent({
      threadId: THREAD_ID,
      userText: USER_TEXT,
      topAgent,
      domainAgents,
      lookup: withCache('work'),
    });
    expect(agent).toBe(domainAgents.work);
    expect(shouldWriteCache).toBe(false);
    // Cache is the source of truth — no embedding round-trip needed
    expect(classifyDomain).not.toHaveBeenCalled();
  });

  it('cache hit on people domain → people agent, classifier NOT called', async () => {
    const { agent, shouldWriteCache } = await selectAgent({
      threadId: THREAD_ID,
      userText: 'who is available this week',
      topAgent,
      domainAgents,
      lookup: withCache('people'),
    });
    expect(agent).toBe(domainAgents.people);
    expect(shouldWriteCache).toBe(false);
    expect(classifyDomain).not.toHaveBeenCalled();
  });

  it('cache hit on knowledge domain → knowledge agent, classifier NOT called', async () => {
    const { agent } = await selectAgent({
      threadId: THREAD_ID,
      userText: 'search policy documents',
      topAgent,
      domainAgents,
      lookup: withCache('knowledge'),
    });
    expect(agent).toBe(domainAgents.knowledge);
    expect(classifyDomain).not.toHaveBeenCalled();
  });

  it('cache hit but domain not in domainAgents → falls back to topAgent, classifier NOT called', async () => {
    const { agent, shouldWriteCache } = await selectAgent({
      threadId: THREAD_ID,
      userText: USER_TEXT,
      topAgent,
      domainAgents: {},
      lookup: withCache('work'),
    });
    expect(agent).toBe(topAgent);
    expect(shouldWriteCache).toBe(false);
    expect(classifyDomain).not.toHaveBeenCalled();
  });

  // ─── Cache miss + classifier confident ────────────────────────────────────

  it('cache miss + classifier confident → domain agent, writes cache', async () => {
    vi.mocked(classifyDomain).mockResolvedValue({ domain: 'work', confidence: 0.92 });
    const { agent, shouldWriteCache, cacheWriteDomain } = await selectAgent({
      threadId: THREAD_ID,
      userText: USER_TEXT,
      topAgent,
      domainAgents,
      lookup: noCache(),
    });
    expect(agent).toBe(domainAgents.work);
    expect(shouldWriteCache).toBe(true);
    expect(cacheWriteDomain).toBe('work');
    expect(classifyDomain).toHaveBeenCalledOnce();
  });

  it('cache miss + classifier confident on self → self agent, writes cache', async () => {
    vi.mocked(classifyDomain).mockResolvedValue({ domain: 'self', confidence: 0.81 });
    const { agent, shouldWriteCache, cacheWriteDomain } = await selectAgent({
      threadId: THREAD_ID,
      userText: 'update my profile',
      topAgent,
      domainAgents,
      lookup: noCache(),
    });
    expect(agent).toBe(domainAgents.self);
    expect(shouldWriteCache).toBe(true);
    expect(cacheWriteDomain).toBe('self');
  });

  it('cache miss + classifier at exactly threshold (0.75) → classifies', async () => {
    vi.mocked(classifyDomain).mockResolvedValue({ domain: 'meta', confidence: 0.75 });
    const { agent, shouldWriteCache } = await selectAgent({
      threadId: THREAD_ID,
      userText: 'what can you do',
      topAgent,
      domainAgents,
      lookup: noCache(),
    });
    expect(agent).toBe(domainAgents.meta);
    expect(shouldWriteCache).toBe(true);
  });

  it('cache miss + classifier confident but domain missing in map → topAgent, no write', async () => {
    vi.mocked(classifyDomain).mockResolvedValue({ domain: 'meta', confidence: 0.95 });
    const { agent, shouldWriteCache } = await selectAgent({
      threadId: THREAD_ID,
      userText: 'what can you do',
      topAgent,
      domainAgents: {},
      lookup: noCache(),
    });
    expect(agent).toBe(topAgent);
    expect(shouldWriteCache).toBe(false);
  });

  // ─── Cache miss + classifier uncertain ────────────────────────────────────

  it('cache miss + classifier returns null → topAgent (full 3-hop), no write', async () => {
    vi.mocked(classifyDomain).mockResolvedValue(null);
    const { agent, shouldWriteCache } = await selectAgent({
      threadId: THREAD_ID,
      userText: 'something ambiguous',
      topAgent,
      domainAgents,
      lookup: noCache(),
    });
    expect(agent).toBe(topAgent);
    expect(shouldWriteCache).toBe(false);
    expect(classifyDomain).toHaveBeenCalledOnce();
  });

  it('cache miss + classifier throws → topAgent (graceful fallback), no write', async () => {
    vi.mocked(classifyDomain).mockRejectedValue(new Error('openai down'));
    const { agent, shouldWriteCache } = await selectAgent({
      threadId: THREAD_ID,
      userText: USER_TEXT,
      topAgent,
      domainAgents,
      lookup: noCache(),
    });
    expect(agent).toBe(topAgent);
    expect(shouldWriteCache).toBe(false);
  });
});
