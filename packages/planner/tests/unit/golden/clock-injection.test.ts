import { describe, expect, it } from 'vitest';
import { buildInstructions } from '../../../src/backend/orchestration/agents/task-search.ts';
import { REFERENCE_TIME } from '../../fixtures/golden/constants.ts';

describe('query task-search prompt anchor uses the injected clock', () => {
  it('embeds the reference date, not wall time, when a clock is injected', () => {
    const prompt = buildInstructions(REFERENCE_TIME);
    // REFERENCE_TIME is 2026-07-01 09:00+07 → UTC date 2026-07-01.
    expect(prompt).toContain('today      = 2026-07-01');
  });

  it('is independent of the system clock for the same injected instant', () => {
    const a = buildInstructions(REFERENCE_TIME);
    const b = buildInstructions(REFERENCE_TIME);
    expect(a).toBe(b);
  });
});
