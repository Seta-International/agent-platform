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
