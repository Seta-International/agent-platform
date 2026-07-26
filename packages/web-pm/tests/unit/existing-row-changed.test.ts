import { describe, expect, it } from 'vitest';
import { type ExistingRowState, existingRowChanged } from '../../src/pages/ra-shared.tsx';

// The over-allocation preview reads the worker's book from the DB, so an unsaved edit to an
// existing allocation is invisible to it (FUT-748). The wizard uses this predicate to decide
// which rows must be persisted before Review impact runs, so the preview scores the on-screen
// state — not a stale allocation still counted at its old length.
describe('existingRowChanged', () => {
  const base: ExistingRowState = {
    account_id: 'acc-1',
    project_id: 'proj-1',
    planned_pct: 100,
    date_from: '2026-01-01',
    date_to: '2026-07-31',
    bucket: 'billable',
    note: '',
  };

  it('is false when the draft matches the saved row', () => {
    expect(existingRowChanged(base, { ...base })).toBe(false);
  });

  it('is true when the end date is shortened (the FUT-748 scenario)', () => {
    expect(existingRowChanged({ ...base, date_to: '2026-06-30' }, base)).toBe(true);
  });

  it('is true when an open-ended row is given a finite end', () => {
    const openEnded = { ...base, date_to: '' };
    expect(existingRowChanged(base, openEnded)).toBe(true);
  });

  it('detects changes to every editable field', () => {
    expect(existingRowChanged({ ...base, account_id: 'acc-2' }, base)).toBe(true);
    expect(existingRowChanged({ ...base, project_id: 'proj-2' }, base)).toBe(true);
    expect(existingRowChanged({ ...base, planned_pct: 50 }, base)).toBe(true);
    expect(existingRowChanged({ ...base, date_from: '2026-02-01' }, base)).toBe(true);
    expect(existingRowChanged({ ...base, bucket: 'bench' }, base)).toBe(true);
    expect(existingRowChanged({ ...base, note: 'moved' }, base)).toBe(true);
  });
});
