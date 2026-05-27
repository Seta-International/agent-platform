import { beforeEach, describe, expect, it } from 'vitest';
import { AgentRegistry, RegistryFrozenError, RegistryNotFrozenError } from '../../src/registry';

describe('AgentRegistry', () => {
  beforeEach(() => AgentRegistry.__resetForTests());

  it('starts unfrozen and accepts registrations', () => {
    expect(AgentRegistry.isFrozen()).toBe(false);
    AgentRegistry.registerSpecialist({
      domain: 'work',
      id: 'planner',
      description: 'Manages tasks',
      instructions: () => 'You manage tasks.',
      tools: {},
    });
    expect(AgentRegistry.listSpecialists('work').map((s) => s.id)).toEqual(['planner']);
  });

  it('refuses registrations after freeze', () => {
    AgentRegistry.freeze();
    expect(() =>
      AgentRegistry.registerSpecialist({
        domain: 'work',
        id: 'x',
        description: '',
        instructions: () => '',
        tools: {},
      }),
    ).toThrow(RegistryFrozenError);
  });

  it('refuses reads before freeze', () => {
    AgentRegistry.registerSpecialist({
      domain: 'work',
      id: 'planner',
      description: 'd',
      instructions: () => '',
      tools: {},
    });
    expect(() => AgentRegistry.snapshot()).toThrow(RegistryNotFrozenError);
  });
});
