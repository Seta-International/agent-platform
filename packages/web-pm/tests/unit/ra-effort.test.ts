import { describe, expect, it } from 'vitest';
import {
  clippedCalendarEffort,
  overAllocatedWorkers,
  peakConcurrentPct,
  rollupKpis,
} from '../../src/pages/ra-effort';

describe('clippedCalendarEffort', () => {
  it('computes working days per month × planned fraction', () => {
    // 2026-01-01 to 2026-03-31 = Jan (0.5) + Feb (0.5) + Mar (0.5) = 1.50
    expect(
      clippedCalendarEffort(
        { date_from: '2026-01-01', date_to: '2026-03-31', planned_pct: 50 },
        {},
      ),
    ).toBe(1.5);
  });
  it('prorates partial month allocations accurately (FUT-882 example)', () => {
    // 2026-08-01 to 2026-08-09 = 5 working days out of 21 working days in August.
    // (50 / 100) * (5 / 21) = 0.1190... -> 0.12
    expect(
      clippedCalendarEffort(
        { date_from: '2026-08-01', date_to: '2026-08-09', planned_pct: 50 },
        {},
      ),
    ).toBe(0.12);
  });
  it('clips to the active window', () => {
    // Jan-Jun 2026 = 6 full months @ 100% = 6.00 MM
    expect(
      clippedCalendarEffort(
        { date_from: '2026-01-01', date_to: '2026-12-31', planned_pct: 100 },
        { from: '2026-01-01', to: '2026-06-30' },
      ),
    ).toBe(6);
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
    // 2026-03-01 to 2026-06-30 = 4 full months (Mar, Apr, May, Jun) @ 100% = 4.00 MM
    expect(
      clippedCalendarEffort(
        { date_from: '2026-03-01', date_to: null, planned_pct: 100 },
        { from: '2026-01-01', to: '2026-06-30' },
      ),
    ).toBe(4);
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
    // w1: Jan (1.0) + Feb (1.0) = 2.00 MM
    // w2: Jan (1.0) = 1.00 MM
    expect(k.total_mm).toBe(3);
    expect(k.billable_mm).toBe(2);
    expect(k.billable_pct).toBe(67);
    expect(k.people).toBe(2);
  });
});
