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

  it('full 3-hop when no threadId', async () => {
    const { agent, shouldWriteCache } = await selectAgent({
      threadId: undefined,
      userText: USER_TEXT,
      topAgent,
      domainAgents,
      lookup: noCache(),
    });
    expect(agent).toBe(topAgent);
    expect(shouldWriteCache).toBe(false);
  });

  it('cache hit + classifier agrees → domain agent, no write', async () => {
    vi.mocked(classifyDomain).mockResolvedValue({ domain: 'work', confidence: 0.92 });
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

  it('cache hit + classifier disagrees → new domain agent, write cache', async () => {
    vi.mocked(classifyDomain).mockResolvedValue({ domain: 'knowledge', confidence: 0.88 });
    const { agent, shouldWriteCache, cacheWriteDomain } = await selectAgent({
      threadId: THREAD_ID,
      userText: 'search policy documents',
      topAgent,
      domainAgents,
      lookup: withCache('work'),
    });
    expect(agent).toBe(domainAgents.knowledge);
    expect(shouldWriteCache).toBe(true);
    expect(cacheWriteDomain).toBe('knowledge');
  });

  it('cache hit + classifier low confidence → trust cache, no write', async () => {
    vi.mocked(classifyDomain).mockResolvedValue(null);
    const { agent, shouldWriteCache } = await selectAgent({
      threadId: THREAD_ID,
      userText: USER_TEXT,
      topAgent,
      domainAgents,
      lookup: withCache('people'),
    });
    expect(agent).toBe(domainAgents.people);
    expect(shouldWriteCache).toBe(false);
  });

  it('cache miss + classifier confident → domain agent, write cache', async () => {
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

  it('cache miss + classifier uncertain → full 3-hop, no write', async () => {
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
  });

  it('falls back to topAgent when domainAgents missing the resolved domain', async () => {
    vi.mocked(classifyDomain).mockResolvedValue({ domain: 'meta', confidence: 0.95 });
    const { agent } = await selectAgent({
      threadId: THREAD_ID,
      userText: 'what can you do',
      topAgent,
      domainAgents: {},
      lookup: noCache(),
    });
    expect(agent).toBe(topAgent);
  });
});
