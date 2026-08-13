import { localDateKey, TEMPORAL_CONTEXT_MARKER } from '@seta/agent-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildAgentFromSpec, mockLanguageModel } from '../../src/testing/fixtures.ts';

const SPEC = {
  id: 'test.specialist',
  instructions: 'You are a test specialist.',
  tools: [],
  rbac: [],
};

function buildSpecialist() {
  return buildAgentFromSpec(SPEC, { model: mockLanguageModel() });
}

/** What a turn actually sees: Mastra resolves function-valued instructions here. */
async function render(agent: { getInstructions: (args?: never) => Promise<unknown> }) {
  return String(await agent.getInstructions());
}

afterEach(() => {
  vi.useRealTimers();
});

describe('FUT-800 buildAgentFromSpec injects temporal context', () => {
  it('renders the temporal block ahead of the spec instructions', async () => {
    const text = await render(buildSpecialist());
    expect(text).toContain(TEMPORAL_CONTEXT_MARKER);
    expect(text).toContain('You are a test specialist.');
    expect(text.indexOf(TEMPORAL_CONTEXT_MARKER)).toBeLessThan(
      text.indexOf('You are a test specialist.'),
    );
  });

  it("states today's date", async () => {
    const text = await render(buildSpecialist());
    expect(text).toContain(`today       = ${localDateKey()}`);
  });

  it('re-renders the date per turn instead of freezing it at construction', async () => {
    // Specialists are constructed once, at boot (registerAgent). If the block
    // were baked into a plain string there, a long-running process would serve
    // the deploy-day date forever — the FUT-800 bug. Crossing local midnight
    // between two resolutions is what distinguishes the two designs.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T17:30:00Z')); // 2026-07-30 00:30 ICT
    const agent = buildSpecialist();
    expect(await render(agent)).toContain('today       = 2026-07-30');

    vi.setSystemTime(new Date('2026-07-30T17:30:00Z')); // 2026-07-31 00:30 ICT
    expect(await render(agent)).toContain('today       = 2026-07-31');
  });
});
