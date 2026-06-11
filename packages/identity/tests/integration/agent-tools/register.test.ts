import { AgentRegistry } from '@seta/agent-sdk';
import { beforeEach, describe, expect, it } from 'vitest';

describe('identity register', () => {
  beforeEach(() => AgentRegistry.__resetForTests());

  it('registers identity specialist in people domain and self specialist in self domain', async () => {
    await import('../../../src/backend/agent-tools/register.ts');
    expect(AgentRegistry.listSpecialists('people').map((s) => s.id)).toEqual(['identity']);
    expect(AgentRegistry.listSpecialists('self').map((s) => s.id)).toEqual(['self']);

    const identity = AgentRegistry.listSpecialists('people')[0]!;
    expect(Object.keys(identity.tools).sort()).toEqual(
      ['identity_listMyRoles', 'identity_whoAmI', 'identity_matchUsersByTopic'].sort(),
    );

    const self = AgentRegistry.listSpecialists('self')[0]!;
    expect(Object.keys(self.tools)).toContain('identity_updateMyDisplayName');

    const reads = AgentRegistry.listCrossModuleReadTools()
      .map((t) => t.id)
      .sort();
    expect(reads).toEqual(
      [
        'identity_getAvailabilityForUser',
        'identity_getTimezoneForUser',
        'identity_searchUsersBySkillVector',
      ].sort(),
    );
  });
});
