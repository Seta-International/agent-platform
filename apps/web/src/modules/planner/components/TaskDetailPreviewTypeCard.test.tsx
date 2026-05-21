import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { makeTaskWithAssignees } from '../testing/fixtures';
import { TaskDetailPreviewTypeCard } from './TaskDetailPreviewTypeCard';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderWithClient(node: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe('TaskDetailPreviewTypeCard', () => {
  it('renders the five options with the current value pre-selected', () => {
    const task = makeTaskWithAssignees({ id: 't1', preview_type: 'checklist' });
    renderWithClient(<TaskDetailPreviewTypeCard task={task} planId="p1" />);
    expect(screen.getByText('Preview')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Checklist', checked: true })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Automatic', checked: false })).toBeInTheDocument();
  });

  it('sends preview_type when an option is clicked', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const captured = vi.fn<(body: Record<string, unknown>) => void>();
    server.use(
      http.patch('/api/planner/v1/tasks/t1', async ({ request }) => {
        captured((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ id: 't1', version: 4 });
      }),
    );

    const task = makeTaskWithAssignees({ id: 't1', preview_type: 'automatic', version: 3 });
    renderWithClient(<TaskDetailPreviewTypeCard task={task} planId="p1" />);
    await user.click(screen.getByRole('radio', { name: 'Reference' }));

    expect(captured.mock.calls[0]?.[0]).toEqual({
      expected_version: 3,
      patch: { preview_type: 'reference' },
    });
  });
});
