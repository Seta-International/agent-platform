import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { summarizeArgs } from '../../../src/components/tool-renderers/summarize-args';
import { ToolFallback } from '../../../src/components/tool-renderers/tool-fallback';

describe('ToolFallback', () => {
  it('renders a running tool with a humanized name and arg summary', () => {
    render(
      <ToolFallback
        part={{
          toolName: 'staffing_analyzeTasks',
          args: { query: 'infra' },
          status: { type: 'running' },
        }}
      />,
    );
    expect(screen.getByText('Staffing Analyze Tasks')).toBeInTheDocument();
    expect(screen.getByText(/query: infra/)).toBeInTheDocument();
  });

  it('renders a completed tool with its result payload behind an expander', async () => {
    const user = userEvent.setup();
    render(
      <ToolFallback
        part={{
          toolName: 'staffing_analyzeTasks',
          status: { type: 'complete' },
          result: { matched: 3 },
        }}
      />,
    );
    expect(screen.getByText('Staffing Analyze Tasks')).toBeInTheDocument();
    // Astryx `ChatToolCalls` conveys status through an icon rather than the old
    // `data-status` attribute, and only makes a row clickable when it carries a
    // `resultDetail` — so "completed with a payload" is asserted through the
    // expander the payload produces.
    await user.click(screen.getByRole('button'));
    expect(screen.getByText(/"matched": 3/)).toBeInTheDocument();
  });

  it('leaves a completed tool with no payload unexpandable', () => {
    render(
      <ToolFallback part={{ toolName: 'staffing_analyzeTasks', status: { type: 'complete' } }} />,
    );
    expect(screen.getByText('Staffing Analyze Tasks')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('surfaces a tool-returned error message', () => {
    render(
      <ToolFallback
        part={{
          toolName: 'x',
          isError: true,
          status: { type: 'complete' },
          result: { message: 'Permission denied' },
        }}
      />,
    );
    // `errorMessage` is not visible text under Astryx — it rides as a native
    // `title` on the status icon (ChatToolCalls.tsx CallRow).
    expect(screen.getByTitle('Permission denied')).toBeInTheDocument();
  });

  it('surfaces an aborted-run error message', () => {
    render(
      <ToolFallback part={{ toolName: 'x', status: { type: 'incomplete', error: 'Cancelled' } }} />,
    );
    expect(screen.getByTitle('Cancelled')).toBeInTheDocument();
  });

  it('still falls back to "failed" when no error detail exists', () => {
    render(<ToolFallback part={{ toolName: 'x', isError: true, status: { type: 'complete' } }} />);
    expect(screen.getByTitle('failed')).toBeInTheDocument();
  });

  it('renders a non-empty labeled row for a bare tool-call with no result, args, or status', () => {
    const { container } = render(<ToolFallback part={{ toolName: 'staffing_analyzeTasks' }} />);
    // The old null-return bug left the chain-of-thought step visibly empty. Guard
    // it: the fallback always paints at least the humanized tool name.
    expect(screen.getByText('Staffing Analyze Tasks')).toBeInTheDocument();
    expect(container.textContent?.trim().length).toBeGreaterThan(0);
  });
});

describe('summarizeArgs', () => {
  it('joins primitive fields and skips empties', () => {
    expect(summarizeArgs({ query: 'infra', limit: 5, taskRef: null })).toBe(
      'query: infra, limit: 5',
    );
  });

  it('returns undefined for non-objects', () => {
    expect(summarizeArgs(undefined)).toBeUndefined();
    expect(summarizeArgs('x')).toBeUndefined();
  });
});
