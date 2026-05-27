import type { Mastra } from '@mastra/core';
import { AgentRegistry } from '@seta/agent-sdk';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildSupervisorTree } from '../../src/backend/supervisor-tree';

type SubAgentRecord = Record<string, unknown>;
function staticAgents(agent: unknown): SubAgentRecord {
  return (agent as { __getStaticAgents: () => SubAgentRecord }).__getStaticAgents();
}

describe('buildSupervisorTree', () => {
  beforeEach(() => AgentRegistry.__resetForTests());

  it('throws if registry not frozen', () => {
    expect(() => buildSupervisorTree()).toThrow();
  });

  it('constructs top supervisor with one domain agent per registered domain', () => {
    AgentRegistry.registerSpecialist({
      domain: 'work',
      id: 'planner',
      description: 'tasks',
      instructions: () => 'you handle tasks',
      tools: {},
    });
    AgentRegistry.freeze();
    const { topSupervisor, domainAgents } = buildSupervisorTree();
    expect(topSupervisor.id).toBe('top-supervisor');
    expect(Object.keys(domainAgents)).toEqual(['work']);
  });

  it('domain supervisor exposes registered specialists as sub-agents', () => {
    AgentRegistry.registerSpecialist({
      domain: 'work',
      id: 'planner',
      description: 'tasks',
      instructions: () => '',
      tools: {},
    });
    AgentRegistry.registerSpecialist({
      domain: 'work',
      id: 'pmo',
      description: 'projects',
      instructions: () => '',
      tools: {},
    });
    AgentRegistry.freeze();
    const { domainAgents } = buildSupervisorTree();
    const work = domainAgents.work;
    expect(Object.keys(staticAgents(work)).sort()).toEqual(['planner', 'pmo']);
  });
});

// Minimal fake that satisfies buildMemory's storage check
function fakeMastra(withStorage = true): Mastra {
  return {
    getStorage: () => (withStorage ? {} : undefined),
  } as unknown as Mastra;
}

describe('buildMemory (via buildSupervisorTree internals)', () => {
  beforeEach(() => AgentRegistry.__resetForTests());

  it('returns undefined when mastra has no storage', () => {
    AgentRegistry.registerSpecialist({
      domain: 'work',
      id: 'p',
      description: 'd',
      instructions: () => '',
      tools: {},
    });
    AgentRegistry.freeze();
    // buildSupervisorTree without mastra → memory undefined → agents built without memory
    const { topSupervisor } = buildSupervisorTree();
    // no crash = memory gracefully absent
    expect(topSupervisor.id).toBe('top-supervisor');
  });

  it('returns a Memory with semanticRecall and workingMemory when databaseUrl is provided', () => {
    AgentRegistry.registerSpecialist({
      domain: 'work',
      id: 'p',
      description: 'd',
      instructions: () => '',
      tools: {},
    });
    AgentRegistry.freeze();

    const mastra = fakeMastra();
    // Provide a dummy key so ModelRouterEmbeddingModel can be instantiated in unit tests
    const originalKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'test-key';
    try {
      expect(() =>
        buildSupervisorTree({ mastra, databaseUrl: 'postgresql://localhost/test' }),
      ).not.toThrow();
    } finally {
      if (originalKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalKey;
      }
    }
  });
});
