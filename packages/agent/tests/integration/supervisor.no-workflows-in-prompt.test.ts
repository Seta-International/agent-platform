import { AgentRegistry } from '@seta/agent-sdk';
import { describe, expect, it } from 'vitest';
import { initAgentRegistry } from '../../src/backend/init-registry.ts';
import { generateDomainPrompt } from '../../src/backend/prompt-templates.ts';

describe('domain supervisor — workflows hidden from LLM surface', () => {
  it('generateDomainPrompt for work omits the Available-workflows block', () => {
    initAgentRegistry();
    const snapshot = AgentRegistry.snapshot();
    const prompt = generateDomainPrompt('work', snapshot);
    expect(prompt).not.toMatch(/Available workflows/);
    expect(prompt).not.toMatch(/assignBySkill/);
    expect(prompt).not.toMatch(/dedupOnCreate/);
    // and still lists the planner specialist
    expect(prompt).toMatch(/planner/);
  });

  it('domain prompt instructs the agent to defer to out-of-chat triggers for workflows', () => {
    initAgentRegistry();
    const snapshot = AgentRegistry.snapshot();
    const prompt = generateDomainPrompt('work', snapshot);
    expect(prompt).toMatch(/out-of-chat trigger|inbox/i);
    // Wording was reworked to "Do not attempt to trigger them yourself" —
    // match the intent (don't fire workflows from chat) rather than the
    // exact phrase.
    expect(prompt).toMatch(/do not (try|attempt) to (invoke|trigger)/i);
  });
});
