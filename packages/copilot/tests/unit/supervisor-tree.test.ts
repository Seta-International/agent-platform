import { CopilotRegistry } from '@seta/copilot-sdk';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildSupervisorTree } from '../../src/backend/supervisor-tree';

type SubAgentRecord = Record<string, unknown>;
function staticAgents(agent: unknown): SubAgentRecord {
  return (agent as { __getStaticAgents: () => SubAgentRecord }).__getStaticAgents();
}

describe('buildSupervisorTree', () => {
  beforeEach(() => CopilotRegistry.__resetForTests());

  it('throws if registry not frozen', () => {
    expect(() => buildSupervisorTree()).toThrow();
  });

  it('constructs top supervisor with one domain agent per registered domain', () => {
    CopilotRegistry.registerSpecialist({
      domain: 'work',
      id: 'planner',
      description: 'tasks',
      instructions: () => 'you handle tasks',
      tools: {},
    });
    CopilotRegistry.freeze();
    const top = buildSupervisorTree();
    expect(top.id).toBe('top-supervisor');
    expect(Object.keys(staticAgents(top))).toEqual(['work']);
  });

  it('domain supervisor exposes registered specialists as sub-agents', () => {
    CopilotRegistry.registerSpecialist({
      domain: 'work',
      id: 'planner',
      description: 'tasks',
      instructions: () => '',
      tools: {},
    });
    CopilotRegistry.registerSpecialist({
      domain: 'work',
      id: 'pmo',
      description: 'projects',
      instructions: () => '',
      tools: {},
    });
    CopilotRegistry.freeze();
    const top = buildSupervisorTree();
    const work = staticAgents(top).work;
    expect(Object.keys(staticAgents(work)).sort()).toEqual(['planner', 'pmo']);
  });
});
