import type { LanguageModel } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { pickModel } from '../../../src/backend/orchestration/model.ts';

describe('pickModel', () => {
  it('returns ctx.model and never calls the fallback when an override is set', () => {
    const override = { modelId: 'override' } as unknown as LanguageModel;
    const fallback = vi.fn(() => ({ modelId: 'default' }) as unknown as LanguageModel);
    expect(pickModel({ model: override }, fallback)).toBe(override);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('falls back to the runtime default when no override is set', () => {
    const def = { modelId: 'default' } as unknown as LanguageModel;
    const fallback = vi.fn(() => def);
    expect(pickModel({}, fallback)).toBe(def);
    expect(fallback).toHaveBeenCalledTimes(1);
  });
});
