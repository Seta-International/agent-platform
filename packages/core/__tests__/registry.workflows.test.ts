import { describe, expect, it, vi } from 'vitest';
import { createContributionRegistry } from '../src/composition/registry.ts';

describe('ContributionRegistry.workflows', () => {
  it('collects all workflow builders in registration order', () => {
    const reg = createContributionRegistry();
    const b1 = vi.fn();
    const b2 = vi.fn();
    reg.workflows('copilot', [b1, b2]);
    expect(reg.collected.workflowBuilders).toEqual([
      { module: 'copilot', builder: b1 },
      { module: 'copilot', builder: b2 },
    ]);
  });

  it('appends across multiple calls', () => {
    const reg = createContributionRegistry();
    const b1 = vi.fn();
    const b2 = vi.fn();
    reg.workflows('copilot', [b1]);
    reg.workflows('planner', [b2]);
    expect(reg.collected.workflowBuilders.map((w) => w.module)).toEqual(['copilot', 'planner']);
  });
});
