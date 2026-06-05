import type { MastraModelConfig } from '@mastra/core/llm';
import { describe, expect, it, vi } from 'vitest';
import { pickModel } from '../../../src/backend/orchestration/model.ts';

describe('pickModel', () => {
  it('returns ctx.model and never calls the fallback when an override is set', () => {
    const override = { modelId: 'override' } as unknown as MastraModelConfig;
    const fallback = vi.fn(() => ({ modelId: 'default' }) as unknown as MastraModelConfig);
    expect(pickModel({ model: override }, fallback)).toBe(override);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('falls back to the runtime default when no override is set', () => {
    const def = { modelId: 'default' } as unknown as MastraModelConfig;
    const fallback = vi.fn(() => def);
    expect(pickModel({}, fallback)).toBe(def);
    expect(fallback).toHaveBeenCalledTimes(1);
  });
});
