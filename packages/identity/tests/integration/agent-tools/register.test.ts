import { CopilotRegistry } from '@seta/copilot-sdk';
import { beforeEach, describe, expect, it } from 'vitest';

describe('identity register', () => {
  beforeEach(() => CopilotRegistry.__resetForTests());

  it('registers identity specialist in people domain and self specialist in self domain', async () => {
    await import('../../../src/backend/agent-tools/register.ts');
    expect(CopilotRegistry.listSpecialists('people').map((s) => s.id)).toEqual(['identity']);
    expect(CopilotRegistry.listSpecialists('self').map((s) => s.id)).toEqual(['self']);

    const identity = CopilotRegistry.listSpecialists('people')[0]!;
    expect(Object.keys(identity.tools).sort()).toEqual(
      ['identity_listMyRoles', 'identity_whoAmI', 'match_users_to_topic'].sort(),
    );

    const self = CopilotRegistry.listSpecialists('self')[0]!;
    expect(Object.keys(self.tools)).toContain('identity_updateMyDisplayName');

    const reads = CopilotRegistry.listCrossModuleReadTools()
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
