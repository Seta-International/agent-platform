import type { LatestScores } from '@seta/core/agent-eval';
import { describe, expect, it, vi } from 'vitest';
import {
  freshnessObservation,
  makeAgentEvalMetricsState,
  scoreObservations,
} from '../../src/agent-eval-metrics.ts';

const cache: LatestScores = {
  rows: [
    {
      specialistId: 'taskQuery',
      scorerId: 'faithfulness',
      layer: 'quality',
      score: 0.8,
      modelTier: 'fast',
    },
  ],
  lastRunFinishedAt: new Date('2026-07-12T00:00:00Z'),
};

describe('scoreObservations', () => {
  it('maps each row to a labelled observation', () => {
    expect(scoreObservations(cache)).toEqual([
      {
        value: 0.8,
        attributes: {
          specialist_id: 'taskQuery',
          scorer_id: 'faithfulness',
          layer: 'quality',
          model_tier: 'fast',
        },
      },
    ]);
  });
  it('emits nothing when the cache is empty', () => {
    expect(scoreObservations(null)).toEqual([]);
  });
});

describe('freshnessObservation', () => {
  it('returns unix seconds of the last run', () => {
    expect(freshnessObservation(cache)).toBe(
      Math.floor(new Date('2026-07-12T00:00:00Z').getTime() / 1000),
    );
  });
  it('returns null when there is no run', () => {
    expect(freshnessObservation({ rows: [], lastRunFinishedAt: null })).toBeNull();
  });
});

describe('makeAgentEvalMetricsState', () => {
  it('refresh() populates the snapshot', async () => {
    const state = makeAgentEvalMetricsState({ readLatest: async () => cache });
    await state.refresh();
    expect(state.snapshot()).toEqual(cache);
  });
  it('keeps the previous snapshot and logs when a refresh rejects', async () => {
    const warn = vi.fn();
    const readLatest = vi
      .fn<() => Promise<LatestScores>>()
      .mockResolvedValueOnce(cache)
      .mockRejectedValueOnce(new Error('db down'));
    const state = makeAgentEvalMetricsState({ readLatest, logger: { warn } });
    await state.refresh();
    await state.refresh();
    expect(state.snapshot()).toEqual(cache); // held
    expect(warn).toHaveBeenCalledOnce();
  });
});
