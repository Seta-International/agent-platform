import { AgentRegistry } from '@seta/agent-sdk';
import { beforeEach, describe, expect, it } from 'vitest';
import { generateDomainPrompt, generateTopRoutingPrompt } from '../../src/backend/prompt-templates';

describe('prompt-templates', () => {
  beforeEach(() => AgentRegistry.__resetForTests());

  it('generateTopRoutingPrompt lists registered domains only', () => {
    AgentRegistry.registerSpecialist({
      domain: 'work',
      id: 'planner',
      description: 'tasks',
      instructions: () => '',
      tools: {},
    });
    AgentRegistry.registerSpecialist({
      domain: 'people',
      id: 'identity',
      description: 'users',
      instructions: () => '',
      tools: {},
    });
    AgentRegistry.freeze();
    const p = generateTopRoutingPrompt(AgentRegistry.snapshot());
    expect(p).toMatch(/Work/);
    expect(p).toMatch(/People/);
    expect(p).not.toMatch(/Finance/);
    expect(p).not.toMatch(/Self/);
  });

  it('generateDomainPrompt lists specialists with their descriptions', () => {
    AgentRegistry.registerSpecialist({
      domain: 'work',
      id: 'planner',
      description: 'Manages tasks and assignments',
      instructions: () => '',
      tools: {},
    });
    AgentRegistry.freeze();
    const p = generateDomainPrompt('work', AgentRegistry.snapshot());
    expect(p).toMatch(/planner.*Manages tasks/s);
  });
});
