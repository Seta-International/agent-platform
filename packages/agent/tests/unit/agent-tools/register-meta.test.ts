import { AgentRegistry } from '@seta/agent-sdk';
import { beforeEach, describe, expect, it } from 'vitest';

describe('meta register', () => {
  beforeEach(() => AgentRegistry.__resetForTests());

  it('registers meta specialist in meta domain with list-capabilities tool', async () => {
    await import('../../../src/backend/agent-tools/register-meta.ts');
    const meta = AgentRegistry.listSpecialists('meta');
    expect(meta).toHaveLength(1);
    expect(Object.keys(meta[0]!.tools)).toContain('meta_listCapabilities');
  });
});
