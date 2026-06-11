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
vi.mock('@/modules/agent/hooks/use-tool-catalog', () => ({
  useToolCatalog: () => ({
    tools: [{ id: 'staffing_search', name: 'Search' }],
    nameFor: (id: string) => id,
  }),
}));

import { ToolUIRegistry } from '@/modules/agent/components/tool-renderers';

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
    render(ui as React.ReactElement);
    // Falls back to the generic running label, not a "key: value" summary.
    expect(screen.getByText(/running/i)).toBeInTheDocument();
  });
});
