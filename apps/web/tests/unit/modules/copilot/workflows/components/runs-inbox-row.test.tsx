import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...rest }: React.PropsWithChildren<Record<string, unknown>>) => {
    const allowed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (k === 'params' || k === 'to') continue;
      allowed[k] = v;
    }
    return <a {...allowed}>{children}</a>;
  },
}));

import type { WorkflowRunRow } from '../../../../../../src/modules/copilot/workflows/api/schemas.ts';
import { RunsInboxRow } from '../../../../../../src/modules/copilot/workflows/components/runs-inbox-row.tsx';

function row(overrides: Partial<WorkflowRunRow> = {}): WorkflowRunRow {
  return {
    runId: '11111111-2222-3333-4444-555555555555',
    workflowId: 'planner.assignBySkill',
    tenantId: 't',
    startedBy: 'u',
    startedVia: 'event',
    status: 'paused',
    suspendReason: null,
    errorSummary: null,
    inputSummary: { taskTitle: 'Wire SSE backpressure' },
    startedAt: new Date().toISOString(),
    finishedAt: null,
    durationMs: null,
    latestApprovalKind: null,
    latestApprovalReason: null,
    ...overrides,
  };
}

describe('RunsInboxRow', () => {
  it('renders the workflow short name + label and the HITL marker when paused', () => {
    render(<RunsInboxRow row={row()} />);
    expect(screen.getByText('assignBySkill')).toBeInTheDocument();
    expect(screen.getByText('Wire SSE backpressure')).toBeInTheDocument();
    expect(screen.getByText('HITL')).toBeInTheDocument();
    const link = screen.getByTestId('runs-inbox-row');
    expect(link.className).not.toMatch(/opacity-60/);
  });

  it('renders superseded rows with distinct treatment and a humanized reason', () => {
    render(
      <RunsInboxRow
        row={row({
          status: 'paused',
          latestApprovalKind: 'superseded',
          latestApprovalReason: 'task-assigned-elsewhere',
        })}
      />,
    );
    const link = screen.getByTestId('runs-inbox-row');
    expect(link.className).toMatch(/opacity-60/);
    expect(link.getAttribute('data-decision-kind')).toBe('superseded');
    expect(screen.getByText(/Superseded — assigned elsewhere/i)).toBeInTheDocument();
    // No competing HITL pill when superseded
    expect(screen.queryByText('HITL')).not.toBeInTheDocument();
  });

  it('falls back to a generic supersede label when reason is unknown', () => {
    render(
      <RunsInboxRow
        row={row({
          latestApprovalKind: 'superseded',
          latestApprovalReason: null,
        })}
      />,
    );
    expect(screen.getByText(/Superseded — previously closed/i)).toBeInTheDocument();
  });

  it('does not apply superseded styling for approved rows', () => {
    render(
      <RunsInboxRow
        row={row({
          status: 'success',
          latestApprovalKind: 'approved',
          latestApprovalReason: null,
        })}
      />,
    );
    const link = screen.getByTestId('runs-inbox-row');
    expect(link.className).not.toMatch(/opacity-60/);
  });
});
