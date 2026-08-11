import { describe, expect, it } from 'vitest';
import { overAllocatedWorkers, peakConcurrentPct } from '../../src/pages/ra-effort';

describe('peakConcurrentPct', () => {
  it('sums overlapping segments', () => {
    expect(
      peakConcurrentPct(
        [
          { date_from: '2026-01-01', date_to: '2026-12-31', planned_pct: 60 },
          { date_from: '2026-01-01', date_to: '2026-12-31', planned_pct: 60 },
        ],
        {},
      ),
    ).toBe(120);
  });

  it('does not sum adjacent (non-overlapping) segments', () => {
    expect(
      peakConcurrentPct(
        [
          { date_from: '2026-01-01', date_to: '2026-06-30', planned_pct: 100 },
          { date_from: '2026-07-01', date_to: '2026-12-31', planned_pct: 100 },
        ],
        {},
      ),
    ).toBe(100);
  });

  it('skips open-ended rows missing a date when no window is provided', () => {
    expect(
      peakConcurrentPct(
        [
          { date_from: '2026-01-01', date_to: null, planned_pct: 80 },
          { date_from: null, date_to: '2026-12-31', planned_pct: 80 },
        ],
        {},
      ),
    ).toBe(0);
  });

  it('includes open-ended rows missing date_from when window is provided', () => {
    expect(
      peakConcurrentPct(
        [
          { date_from: null, date_to: '2026-06-30', planned_pct: 60 },
          { date_from: '2026-01-01', date_to: '2026-06-30', planned_pct: 60 },
        ],
        { from: '2026-01-01', to: '2026-12-31' },
      ),
    ).toBe(120);
  });

  it('clips to the active window', () => {
    expect(
      peakConcurrentPct(
        [
          { date_from: '2026-01-01', date_to: '2026-03-31', planned_pct: 100 },
          { date_from: '2026-06-01', date_to: '2026-09-30', planned_pct: 100 },
        ],
        { from: '2026-06-01', to: '2026-12-31' },
      ),
    ).toBe(100);
  });
});

describe('overAllocatedWorkers', () => {
  it('flags a worker whose overlapping effort exceeds 100%', () => {
    const over = overAllocatedWorkers(
      [
        { worker_id: 'w1', date_from: '2026-01-01', date_to: '2026-12-31', planned_pct: 60 },
        { worker_id: 'w1', date_from: '2026-01-01', date_to: '2026-12-31', planned_pct: 60 },
        { worker_id: 'w2', date_from: '2026-01-01', date_to: '2026-12-31', planned_pct: 50 },
      ],
      {},
    );
    expect(over.has('w1')).toBe(true);
    expect(over.has('w2')).toBe(false);
  });

  it('treats exactly 100% as within capacity', () => {
    const over = overAllocatedWorkers(
      [
        { worker_id: 'w1', date_from: '2026-01-01', date_to: '2026-12-31', planned_pct: 50 },
        { worker_id: 'w1', date_from: '2026-01-01', date_to: '2026-12-31', planned_pct: 50 },
      ],
      {},
    );
    expect(over.size).toBe(0);
  });

  it('ignores unfilled (null worker) rows', () => {
    const over = overAllocatedWorkers(
      [{ worker_id: null, date_from: '2026-01-01', date_to: '2026-12-31', planned_pct: 200 }],
      {},
    );
    expect(over.size).toBe(0);
  });
});
