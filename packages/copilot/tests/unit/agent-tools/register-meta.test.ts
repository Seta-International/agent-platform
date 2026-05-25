import { CopilotRegistry } from '@seta/copilot-sdk';
import { beforeEach, describe, expect, it } from 'vitest';

describe('meta register', () => {
  beforeEach(() => CopilotRegistry.__resetForTests());

  it('registers meta specialist in meta domain with list-capabilities tool', async () => {
    await import('../../../src/backend/agent-tools/register-meta.ts');
    const meta = CopilotRegistry.listSpecialists('meta');
    expect(meta).toHaveLength(1);
    expect(Object.keys(meta[0]!.tools)).toContain('meta_listCapabilities');
  });
});
