import { describe, expect, it } from 'vitest';
import {
  assertProjectOpenForRequisition,
  isProjectEndedForRequisition,
} from '../../src/backend/domain/assert-project-open-for-requisition.ts';

describe('assertProjectOpenForRequisition', () => {
  it('rejects a project whose End Date is already in the past', () => {
    expect(() => assertProjectOpenForRequisition('2026-08-01', '2026-09-04')).toThrow(
      "This project ended 01-08-2026 — a new Requisition can't be opened for it",
    );
  });

  it('allows a project with no End Date', () => {
    expect(() => assertProjectOpenForRequisition(null, '2026-09-04')).not.toThrow();
  });

  it('allows a project whose End Date is today or later', () => {
    expect(() => assertProjectOpenForRequisition('2026-09-04', '2026-09-04')).not.toThrow();
    expect(() => assertProjectOpenForRequisition('2026-12-31', '2026-09-04')).not.toThrow();
  });
});

describe('isProjectEndedForRequisition', () => {
  it('is true once End Date is before today', () => {
    expect(isProjectEndedForRequisition('2026-08-01', '2026-09-04')).toBe(true);
  });

  it('is false when there is no End Date', () => {
    expect(isProjectEndedForRequisition(null, '2026-09-04')).toBe(false);
  });

  it('is false when End Date is today', () => {
    expect(isProjectEndedForRequisition('2026-09-04', '2026-09-04')).toBe(false);
  });
});
