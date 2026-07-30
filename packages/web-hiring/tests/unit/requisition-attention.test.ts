import { describe, expect, it } from 'vitest';
import type { RequisitionListRow } from '../../src/api/hiring-client.ts';
import { deriveAttention } from '../../src/pages/requisition-format.ts';

// Build an otherwise-healthy open requisition; each test overrides only the fields under test.
function row(over: Partial<RequisitionListRow>): RequisitionListRow {
  return {
    id: 'r1',
    title: 'Backend Engineer',
    role_title: null,
    account_id: null,
    account_name: 'Acme',
    project_id: null,
    project_name: 'Payments',
    grade: 'G4',
    kind: 'new',
    approval_status: 'approved',
    stage: 'sourcing',
    status: 'open',
    note: null,
    start_date: null,
    due_date: null,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    skills: [],
    openings_total: 1,
    openings_open: 1,
    applicants_count: 3,
    applicants_internal: 0,
    applicants_external: 0,
    hired_count: 0,
    applicants: [
      {
        name: 'A',
        role: null,
        applied_date: '2026-06-02',
        stage: 'new',
        kind: 'external',
        status: 'active',
      },
    ],
    version: 1,
    ...over,
  };
}

function inDays(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString();
}

describe('deriveAttention', () => {
  it('marks a cancelled requisition as closed/neutral', () => {
    expect(deriveAttention(row({ status: 'cancelled' }))).toMatchObject({
      dotVariant: 'neutral',
      statusWord: 'Cancelled',
    });
  });

  it('marks a filled requisition as success', () => {
    expect(deriveAttention(row({ status: 'filled' }))).toMatchObject({
      dotVariant: 'success',
      statusWord: 'Filled',
    });
  });

  it('surfaces a rejected approval as an error', () => {
    expect(deriveAttention(row({ approval_status: 'rejected' }))).toMatchObject({
      dotVariant: 'error',
      statusWord: 'Rejected',
    });
  });

  it('surfaces a pending approval as blocked/neutral', () => {
    expect(deriveAttention(row({ approval_status: 'pending_approval' }))).toMatchObject({
      dotVariant: 'neutral',
      statusWord: 'Pending',
    });
  });

  it('shows an on-hold requisition as a warning', () => {
    expect(deriveAttention(row({ status: 'on_hold' }))).toMatchObject({
      dotVariant: 'warning',
      statusWord: 'On hold',
    });
  });

  // Open requisitions carry no status word — the card shows the due-date countdown there, and
  // the StatusDot tone carries the "needs attention" signal.
  it('flags an overdue open requisition on the dot, with no status word', () => {
    expect(deriveAttention(row({ due_date: inDays(-3) }))).toMatchObject({
      dotVariant: 'error',
      statusWord: null,
    });
  });

  it('flags an empty pipeline before checking the due date', () => {
    expect(
      deriveAttention(row({ applicants_count: 0, applicants: [], due_date: inDays(2) })),
    ).toMatchObject({ dotVariant: 'warning', statusWord: null });
  });

  it('warns when the due date is within a week', () => {
    expect(deriveAttention(row({ due_date: inDays(4) }))).toMatchObject({
      dotVariant: 'warning',
      statusWord: null,
    });
  });

  it('treats a healthy open requisition as on-track', () => {
    expect(deriveAttention(row({ applicants_count: 5 }))).toMatchObject({
      dotVariant: 'success',
      statusWord: null,
    });
  });
});
