import { describe, expect, it } from 'vitest';
import { buildPlannerQueryEvalTarget } from '../../../src/backend/orchestration/eval-target.ts';

describe('buildPlannerQueryEvalTarget', () => {
  it('returns an object with deterministic and quality runtime builders', () => {
    const target = buildPlannerQueryEvalTarget();

    expect(target).toHaveProperty('buildDeterministicRuntime');
    expect(target).toHaveProperty('buildQualityRuntime');
    expect(typeof target.buildDeterministicRuntime).toBe('function');
    expect(typeof target.buildQualityRuntime).toBe('function');
  });

  it('deterministic runtime has runStream function', () => {
    const target = buildPlannerQueryEvalTarget();
    const runtime = target.buildDeterministicRuntime();

    expect(runtime).toHaveProperty('runStream');
    expect(typeof runtime.runStream).toBe('function');
  });

  it('quality runtime accepts a resolveModel override', () => {
    const target = buildPlannerQueryEvalTarget();
    const runtime = target.buildQualityRuntime({
      resolveModel: () => ({}) as never,
    });

    expect(runtime).toHaveProperty('runStream');
    expect(typeof runtime.runStream).toBe('function');
  });
});
