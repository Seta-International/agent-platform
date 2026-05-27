import type { Agent } from '@mastra/core/agent';
import type { Domain } from '@seta/agent-sdk';
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

  const classifierResult = await classifyDomain(userText);
  const cached = lookup.cache;

  if (cached) {
    const classifierDisagrees =
      classifierResult !== null && classifierResult.domain !== cached.domain;

    if (classifierDisagrees) {
      const newDomain = classifierResult.domain;
      const agent = domainAgents[newDomain] ?? topAgent;
      return { agent, shouldWriteCache: true, cacheWriteDomain: newDomain };
    }

    const agent = domainAgents[cached.domain] ?? topAgent;
    return { agent, shouldWriteCache: false };
  }

  if (classifierResult) {
    const agent = domainAgents[classifierResult.domain] ?? topAgent;
    return { agent, shouldWriteCache: true, cacheWriteDomain: classifierResult.domain };
  }

  return { agent: topAgent, shouldWriteCache: false };
}
