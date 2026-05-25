import { beforeEach, describe, expect, it } from 'vitest';
import { CopilotRegistry, RegistryFrozenError, RegistryNotFrozenError } from '../../src/registry';

describe('CopilotRegistry', () => {
  beforeEach(() => CopilotRegistry.__resetForTests());

  it('starts unfrozen and accepts registrations', () => {
    expect(CopilotRegistry.isFrozen()).toBe(false);
    CopilotRegistry.registerSpecialist({
      domain: 'work',
      id: 'planner',
      description: 'Manages tasks',
      instructions: () => 'You manage tasks.',
      tools: {},
    });
    expect(CopilotRegistry.listSpecialists('work').map((s) => s.id)).toEqual(['planner']);
  });

  it('refuses registrations after freeze', () => {
    CopilotRegistry.freeze();
    expect(() =>
      CopilotRegistry.registerSpecialist({
        domain: 'work',
        id: 'x',
        description: '',
        instructions: () => '',
        tools: {},
      }),
    ).toThrow(RegistryFrozenError);
  });

  it('refuses reads before freeze', () => {
    CopilotRegistry.registerSpecialist({
      domain: 'work',
      id: 'planner',
      description: 'd',
      instructions: () => '',
      tools: {},
    });
    expect(() => CopilotRegistry.snapshot()).toThrow(RegistryNotFrozenError);
  });
});
