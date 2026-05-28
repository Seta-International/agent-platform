import type { Domain } from '@seta/agent-sdk';
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
  //
  // NOTE: the implementation always calls the classifier so it can detect
  // cache drift (`classifierDisagrees` branch in routing-fast-path.ts). The
  // tests below reflect that: on a cache hit, the classifier IS called, but
  // the cache wins unless the classifier disagrees with high confidence.

  it('cache hit + classifier agrees → cached domain agent, no cache write', async () => {
    vi.mocked(classifyDomain).mockResolvedValue({ domain: 'work', confidence: 0.9 });
    const { agent, shouldWriteCache } = await selectAgent({
      threadId: THREAD_ID,
      userText: USER_TEXT,
      topAgent,
      domainAgents,
      lookup: withCache('work'),
    });
    expect(agent).toBe(domainAgents.work);
    expect(shouldWriteCache).toBe(false);
  });

  it('cache hit on people domain → people agent regardless of classifier null', async () => {
    vi.mocked(classifyDomain).mockResolvedValue(null);
    const { agent, shouldWriteCache } = await selectAgent({
      threadId: THREAD_ID,
      userText: 'who is available this week',
      topAgent,
      domainAgents,
      lookup: withCache('people'),
    });
    expect(agent).toBe(domainAgents.people);
    expect(shouldWriteCache).toBe(false);
  });

  it('cache hit on knowledge domain + classifier agrees → knowledge agent', async () => {
    vi.mocked(classifyDomain).mockResolvedValue({ domain: 'knowledge', confidence: 0.88 });
    const { agent } = await selectAgent({
      threadId: THREAD_ID,
      userText: 'search policy documents',
      topAgent,
      domainAgents,
      lookup: withCache('knowledge'),
    });
    expect(agent).toBe(domainAgents.knowledge);
  });

  it('cache hit but domain not in domainAgents → falls back to topAgent', async () => {
    vi.mocked(classifyDomain).mockResolvedValue(null);
    const { agent, shouldWriteCache } = await selectAgent({
      threadId: THREAD_ID,
      userText: USER_TEXT,
      topAgent,
      domainAgents: {},
      lookup: withCache('work'),
    });
    expect(agent).toBe(topAgent);
    expect(shouldWriteCache).toBe(false);
  });

  it('cache hit + classifier disagrees → switches to classifier domain, writes cache', async () => {
    vi.mocked(classifyDomain).mockResolvedValue({ domain: 'people', confidence: 0.9 });
    const { agent, shouldWriteCache, cacheWriteDomain } = await selectAgent({
      threadId: THREAD_ID,
      userText: USER_TEXT,
      topAgent,
      domainAgents,
      lookup: withCache('work'),
    });
    expect(agent).toBe(domainAgents.people);
    expect(shouldWriteCache).toBe(true);
    expect(cacheWriteDomain).toBe('people');
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

  it('cache miss + classifier confident but domain missing in map → topAgent + writes classifier domain', async () => {
    // The implementation writes the cache for the classifier's domain even
    // when the local map can't serve it — the agent process may have a
    // different set of domain agents on the next turn (e.g. a deploy added
    // one). Falling back to topAgent for this turn while still recording the
    // classifier's intent keeps subsequent turns on the cached fast path.
    vi.mocked(classifyDomain).mockResolvedValue({ domain: 'meta', confidence: 0.95 });
    const { agent, shouldWriteCache, cacheWriteDomain } = await selectAgent({
      threadId: THREAD_ID,
      userText: 'what can you do',
      topAgent,
      domainAgents: {},
      lookup: noCache(),
    });
    expect(agent).toBe(topAgent);
    expect(shouldWriteCache).toBe(true);
    expect(cacheWriteDomain).toBe('meta');
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

  it('cache miss + classifier resolves null (covers internal-error path) → topAgent, no write', async () => {
    // `classifyDomain` swallows its own errors and returns null (see the
    // try/catch in domain-classifier.ts). selectAgent therefore never sees a
    // throw — it only ever sees `null`. That's what we assert here.
    vi.mocked(classifyDomain).mockResolvedValue(null);
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
