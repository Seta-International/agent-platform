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
      ['identity_listMyRoles', 'identity_whoAmI'].sort(),
    );

    const self = AgentRegistry.listSpecialists('self')[0]!;
    expect(Object.keys(self.tools)).toContain('identity_updateMyDisplayName');

    // presence cross-module reads moved to People — identity no longer registers them
    const reads = AgentRegistry.listCrossModuleReadTools().map((t) => t.id);
    expect(reads).not.toContain('identity_getAvailabilityForUser');
    expect(reads).not.toContain('identity_getTimezoneForUser');
  });
});
