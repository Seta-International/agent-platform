import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowsPage } from '../../../../src/workflows/pages/workflows-page.tsx';

vi.mock('../../../../src/workflows/api/workflows.ts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../src/workflows/api/workflows.ts')>();
  return {
    ...actual,
    workflowsApi: {
      ...actual.workflowsApi,
      listDefinitions: () => Promise.resolve({ rows: [] }),
      listRuns: () => Promise.resolve({ rows: [], nextCursor: null }),
    },
  };
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <WorkflowsPage />
    </QueryClientProvider>,
  );
}

describe('WorkflowsPage — breadcrumb trail (Astryx migration)', () => {
  it('renders the Agent Studio → Workflows trail with the title as the only h1', () => {
    renderPage();

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const rootCrumb = within(nav).getByRole('link', { name: 'Agent Studio' });
    expect(rootCrumb).toHaveAttribute('href', '/agent');

    // Current (terminal) crumb — manifest label and page title agree ("Workflows").
    expect(within(nav).getByText('Workflows').closest('a')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Workflows' })).toBeInTheDocument();
  });
});
