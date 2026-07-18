import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

type ToolRender = (props: unknown) => unknown;
const toolRenders = new Map<string, ToolRender>();

vi.mock('@assistant-ui/react', () => ({
  useAssistantToolUI: ({ toolName, render }: { toolName: string; render: ToolRender }) => {
    toolRenders.set(toolName, render);
  },
  useAssistantDataUI: () => {},
}));
vi.mock('../../../src/hooks/use-tool-catalog', () => ({
  useToolCatalog: () => ({
    tools: [{ id: 'staffing_search', name: 'Search' }],
    nameFor: (id: string) => id,
  }),
}));

import { ToolUIRegistry } from '../../../src/components/tool-renderers';

describe('generic tool card streaming args', () => {
  it('shows the input args while the tool is running', () => {
    toolRenders.clear();
    render(<ToolUIRegistry />);
    const renderFn = toolRenders.get('staffing_search');
    expect(typeof renderFn).toBe('function');
    const ui = renderFn?.({ status: { type: 'running' }, args: { query: 'react' } });
    render(ui as React.ReactElement);
    expect(screen.getByText(/query: react/)).toBeInTheDocument();
  });

  it('omits the summary when there are no args', () => {
    toolRenders.clear();
    render(<ToolUIRegistry />);
    const renderFn = toolRenders.get('staffing_search');
    const ui = renderFn?.({ status: { type: 'running' }, args: {} });
    const { container } = render(ui as React.ReactElement);
    // Nothing to summarize, so the row is just the tool name. Astryx signals
    // "running" with a spinner rather than the old `running…` text label, so
    // there is no generic fallback string to fall back to any more.
    //
    // Assert the absence of a leaked summary rather than pinning the whole
    // subtree's text: `summarizeArgs` always formats as `key: value[, ...]`,
    // so any leaked summary necessarily contains a colon. A bare `toBe` match
    // would also break on any incidental text Astryx adds to the running row
    // (e.g. a spinner picking up a visible accessible label) with no bearing
    // on this test's actual intent.
    expect(screen.getByText('Search')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/:/);
  });

  it('surfaces a tool-returned error message (complete + isError)', () => {
    toolRenders.clear();
    render(<ToolUIRegistry />);
    const renderFn = toolRenders.get('staffing_search');
    const ui = renderFn?.({
      status: { type: 'complete' },
      isError: true,
      result: { message: 'No matching users' },
      args: {},
    });
    render(ui as React.ReactElement);
    expect(screen.getByTitle('No matching users')).toBeInTheDocument();
  });

  it('surfaces an aborted-run error message (incomplete + status.error)', () => {
    toolRenders.clear();
    render(<ToolUIRegistry />);
    const renderFn = toolRenders.get('staffing_search');
    const ui = renderFn?.({
      status: { type: 'incomplete', reason: 'error', error: 'Upstream timeout' },
      args: {},
    });
    render(ui as React.ReactElement);
    expect(screen.getByTitle('Upstream timeout')).toBeInTheDocument();
  });
});
