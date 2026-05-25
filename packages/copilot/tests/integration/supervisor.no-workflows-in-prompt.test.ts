import { CopilotRegistry } from '@seta/copilot-sdk';
import { describe, expect, it } from 'vitest';
import { initCopilotRegistry } from '../../src/backend/init-registry.ts';
import { generateDomainPrompt } from '../../src/backend/prompt-templates.ts';

describe('domain supervisor — workflows hidden from LLM surface', () => {
  it('generateDomainPrompt for work omits the Available-workflows block', () => {
    initCopilotRegistry();
    const snapshot = CopilotRegistry.snapshot();
    const prompt = generateDomainPrompt('work', snapshot);
    expect(prompt).not.toMatch(/Available workflows/);
    expect(prompt).not.toMatch(/assignBySkill/);
    expect(prompt).not.toMatch(/dedupOnCreate/);
    // and still lists the planner specialist
    expect(prompt).toMatch(/planner/);
  });

  it('domain prompt instructs the agent to defer to out-of-chat triggers for workflows', () => {
    initCopilotRegistry();
    const snapshot = CopilotRegistry.snapshot();
    const prompt = generateDomainPrompt('work', snapshot);
    expect(prompt).toMatch(/out-of-chat trigger|inbox/i);
    expect(prompt).toMatch(/do not try to invoke a workflow/i);
  });
});
