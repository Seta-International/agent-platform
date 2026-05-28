import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, ...rest }: React.PropsWithChildren<Record<string, unknown>>) => {
    const allowed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (k === 'params' || k === 'to') continue;
      allowed[k] = v;
    }
    return <a {...allowed}>{children}</a>;
  },
}));

import { SuggestAssigneeButton } from '../../../../../src/modules/planner/components/SuggestAssigneeButton';

function withQuery(children: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('SuggestAssigneeButton', () => {
  it('renders the start trigger when no pending run exists', () => {
    render(
      withQuery(
        <SuggestAssigneeButton taskId="t1" taskTitle="A task" pendingAssignWorkflowRunId={null} />,
      ),
    );
    expect(screen.getByRole('button', { name: /Suggest assignee/i })).toBeInTheDocument();
    expect(screen.queryByTestId('suggest-in-progress-link')).not.toBeInTheDocument();
  });

  it('renders a deep link instead of the start trigger when a run is already pending', () => {
    render(
      withQuery(
        <SuggestAssigneeButton taskId="t1" taskTitle="A task" pendingAssignWorkflowRunId="r-123" />,
      ),
    );
    const link = screen.getByTestId('suggest-in-progress-link');
    expect(link).toBeInTheDocument();
    expect(screen.getByText(/View workflow/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Suggest assignee/i })).not.toBeInTheDocument();
  });
});
