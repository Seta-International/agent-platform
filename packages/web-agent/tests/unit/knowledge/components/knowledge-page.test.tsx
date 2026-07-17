import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { knowledgeApi } from '../../../../src/knowledge/api/client';
import { KnowledgePage } from '../../../../src/knowledge/knowledge-page';

// EventSource is not available in happy-dom
class MockEventSource {
  addEventListener() {}
  close() {}
}
vi.stubGlobal('EventSource', MockEventSource);

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe('KnowledgePage', () => {
  it('renders page title and empty state when no files', async () => {
    vi.spyOn(knowledgeApi, 'list').mockResolvedValue([]);

    render(wrap(<KnowledgePage />));

    // "Knowledge" also appears as the current breadcrumb crumb; scope to the h1.
    expect(screen.getByRole('heading', { level: 1, name: 'Knowledge' })).toBeInTheDocument();
    // Wait for empty state
    expect(await screen.findByText(/Nothing here yet/i)).toBeInTheDocument();
  });

  it('renders the Agent Studio → Knowledge breadcrumb trail', async () => {
    vi.spyOn(knowledgeApi, 'list').mockResolvedValue([]);

    render(wrap(<KnowledgePage />));

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const link = within(nav).getByRole('link', { name: 'Agent Studio' });
    expect(link).toHaveAttribute('href', '/agent');
    // Terminal crumb is not a link.
    expect(within(nav).getByText('Knowledge').closest('a')).toBeNull();
  });

  it('renders a file row when files are returned', async () => {
    vi.spyOn(knowledgeApi, 'list').mockResolvedValue([
      {
        file_id: 'f1',
        filename: 'handbook.pdf',
        mime_type: 'application/pdf',
        size_bytes: 1024,
        status: 'ready',
        error_reason: null,
        created_at: new Date().toISOString(),
        processed_at: new Date().toISOString(),
      },
    ]);

    render(wrap(<KnowledgePage />));

    expect(await screen.findByText('handbook.pdf')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });
});
