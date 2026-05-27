import { AgentRegistry } from '@seta/agent-sdk';
import { beforeEach, describe, expect, it } from 'vitest';

describe('knowledge specialist registration', () => {
  beforeEach(() => {
    AgentRegistry.__resetForTests();
  });

  it('registers a knowledge specialist with the search tool when register.ts is loaded', async () => {
    await import('../../src/backend/agent-tools/register.ts');
    AgentRegistry.freeze();
    const snapshot = AgentRegistry.snapshot();

    const knowledgeSpecs = snapshot.specialists.filter((s) => s.domain === 'knowledge');
    expect(knowledgeSpecs).toHaveLength(1);

    const spec = knowledgeSpecs[0]!;
    expect(spec.id).toBe('knowledge');
    expect(spec.description).toMatch(/document/i);
    expect(Object.keys(spec.tools)).toContain('knowledge_search');
  });
});
