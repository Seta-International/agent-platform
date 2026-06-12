import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { summarizeArgs } from '@/modules/agent/components/tool-renderers/summarize-args';
import { ToolFallback } from '@/modules/agent/components/tool-renderers/tool-fallback';

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

  it('renders a completed tool as ok', () => {
    render(
      <ToolFallback part={{ toolName: 'staffing_analyzeTasks', status: { type: 'complete' } }} />,
    );
    const el = screen.getByText('Staffing Analyze Tasks').closest('[data-status]');
    expect(el).toHaveAttribute('data-status', 'ok');
  });

  it('renders an errored tool', () => {
    render(<ToolFallback part={{ toolName: 'x', isError: true, status: { type: 'complete' } }} />);
    expect(screen.getByText('failed')).toBeInTheDocument();
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
