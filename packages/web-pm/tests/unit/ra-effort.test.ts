import { describe, expect, it } from 'vitest';
import {
  clippedCalendarEffort,
  overAllocatedWorkers,
  peakConcurrentPct,
  rollupKpis,
} from '../../src/pages/ra-effort';

describe('clippedCalendarEffort', () => {
  it('computes working days ÷ 22 × planned fraction', () => {
    // 2026-01-01 to 2026-03-31 = 64 working days (22 + 20 + 22).
    // (50 / 100) * (64 / 22) = 1.4545... -> 1.45
    expect(
      clippedCalendarEffort(
        { date_from: '2026-01-01', date_to: '2026-03-31', planned_pct: 50 },
        {},
      ),
    ).toBe(1.45);
  });
  it('prorates partial month allocations accurately (FUT-882 example)', () => {
    // 2026-08-01 to 2026-08-09 = 5 working days (Mon 3 Aug to Fri 7 Aug).
    // (50 / 100) * (5 / 22) = 0.1136... -> 0.11
    expect(
      clippedCalendarEffort(
        { date_from: '2026-08-01', date_to: '2026-08-09', planned_pct: 50 },
        {},
      ),
    ).toBe(0.11);
  });
  it('clips to the active window', () => {
    // Jan-Jun 2026 = 129 working days. 1.0 * (129 / 22) = 5.8636... -> 5.86
    expect(
      clippedCalendarEffort(
        { date_from: '2026-01-01', date_to: '2026-12-31', planned_pct: 100 },
        { from: '2026-01-01', to: '2026-06-30' },
      ),
    ).toBe(5.86);
  });
  it('returns 0 for placeholder rows with no dates', () => {
    expect(clippedCalendarEffort({ date_from: null, date_to: null, planned_pct: 50 }, {})).toBe(0);
  });
  it('returns 0 when the window excludes the row', () => {
    expect(
      clippedCalendarEffort(
        { date_from: '2026-09-01', date_to: '2026-12-31', planned_pct: 100 },
        { from: '2026-01-01', to: '2026-06-30' },
      ),
    ).toBe(0);
  });
  it('clips an open-ended row (no end date) to the window end instead of returning 0', () => {
    // 2026-03-01 to 2026-06-30 = 87 working days. 1.0 * (87 / 22) = 3.9545... -> 3.95
    expect(
      clippedCalendarEffort(
        { date_from: '2026-03-01', date_to: null, planned_pct: 100 },
        { from: '2026-01-01', to: '2026-06-30' },
      ),
    ).toBe(3.95);
  });
});

describe('peakConcurrentPct / overAllocatedWorkers', () => {
  it('counts an open-ended allocation (no end date) as ongoing through the window', () => {
    const rows = [
      { date_from: '2026-04-09', date_to: '2026-12-23', planned_pct: 30 },
      { date_from: '2026-03-01', date_to: null, planned_pct: 100 },
    ];
    expect(peakConcurrentPct(rows, { from: '2026-01-01', to: '2026-12-31' })).toBe(130);
  });

  it('flags the worker as over-allocated when one of the overlapping rows is open-ended', () => {
    const rows = [
      {
        worker_id: 'w1',
        date_from: '2026-04-09',
        date_to: '2026-12-23',
        planned_pct: 30,
      },
      {
        worker_id: 'w1',
        date_from: '2026-03-01',
        date_to: null,
        planned_pct: 100,
      },
    ];
    const over = overAllocatedWorkers(rows, { from: '2026-01-01', to: '2026-12-31' });
    expect(over.has('w1')).toBe(true);
  });
});

describe('rollupKpis', () => {
  it('totals effort, billable, and distinct people', () => {
    const rows = [
      {
        date_from: '2026-01-01',
        date_to: '2026-02-28',
        planned_pct: 100,
        bucket: 'billable',
        worker_id: 'w1',
      },
      {
        date_from: '2026-01-01',
        date_to: '2026-01-31',
        planned_pct: 100,
        bucket: 'internal',
        worker_id: 'w2',
      },
    ];
    const k = rollupKpis(rows, {});
    // w1: 42 working days -> 1.91 MM
    // w2: 22 working days -> 1.00 MM
    expect(k.total_mm).toBe(2.91);
    expect(k.billable_mm).toBe(1.91);
    expect(k.billable_pct).toBe(66);
    expect(k.people).toBe(2);
  });
});
