import { CopilotRegistry } from '@seta/copilot-sdk';
import { beforeEach, describe, expect, it } from 'vitest';
import { generateDomainPrompt, generateTopRoutingPrompt } from '../../src/backend/prompt-templates';

describe('prompt-templates', () => {
  beforeEach(() => CopilotRegistry.__resetForTests());

  it('generateTopRoutingPrompt lists registered domains only', () => {
    CopilotRegistry.registerSpecialist({
      domain: 'work',
      id: 'planner',
      description: 'tasks',
      instructions: () => '',
      tools: {},
    });
    CopilotRegistry.registerSpecialist({
      domain: 'people',
      id: 'identity',
      description: 'users',
      instructions: () => '',
      tools: {},
    });
    CopilotRegistry.freeze();
    const p = generateTopRoutingPrompt(CopilotRegistry.snapshot());
    expect(p).toMatch(/Work/);
    expect(p).toMatch(/People/);
    expect(p).not.toMatch(/Finance/);
    expect(p).not.toMatch(/Self/);
  });

  it('generateDomainPrompt lists specialists with their descriptions', () => {
    CopilotRegistry.registerSpecialist({
      domain: 'work',
      id: 'planner',
      description: 'Manages tasks and assignments',
      instructions: () => '',
      tools: {},
    });
    CopilotRegistry.freeze();
    const p = generateDomainPrompt('work', CopilotRegistry.snapshot());
    expect(p).toMatch(/planner.*Manages tasks/s);
  });
});
