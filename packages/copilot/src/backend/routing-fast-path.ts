import type { Agent } from '@mastra/core/agent';
import type { Domain } from '@seta/copilot-sdk';
import { classifyDomain } from './domain-classifier.ts';
import type { RoutingCacheLookup } from './routing-cache.ts';

export type SelectAgentResult = {
  agent: Agent;
  shouldWriteCache: boolean;
  cacheWriteDomain?: Domain;
};

export type SelectAgentOpts = {
  threadId: string | undefined;
  userText: string;
  topAgent: Agent;
  domainAgents: Record<string, Agent>;
  lookup: RoutingCacheLookup;
};

export async function selectAgent(opts: SelectAgentOpts): Promise<SelectAgentResult> {
  const { threadId, userText, topAgent, domainAgents, lookup } = opts;

  if (!threadId) {
    return { agent: topAgent, shouldWriteCache: false };
  }

  // Cache hit: short-circuit immediately, no classifier call needed
  if (lookup.cache) {
    const agent = domainAgents[lookup.cache.domain] ?? topAgent;
    return { agent, shouldWriteCache: false };
  }

  // Cache miss: run classifier, guarded against API failures
  let classifierResult: Awaited<ReturnType<typeof classifyDomain>> = null;
  try {
    classifierResult = await classifyDomain(userText);
  } catch {
    return { agent: topAgent, shouldWriteCache: false };
  }

  if (classifierResult) {
    const agent = domainAgents[classifierResult.domain];
    if (!agent) return { agent: topAgent, shouldWriteCache: false };
    return { agent, shouldWriteCache: true, cacheWriteDomain: classifierResult.domain };
  }

  return { agent: topAgent, shouldWriteCache: false };
}
