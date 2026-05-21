import { render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { makeTaskWithAssignees } from '../testing/fixtures';
import { TaskDetailExternalCard } from './TaskDetailExternalCard';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('TaskDetailExternalCard', () => {
  it('renders 4 KV rows', () => {
    const task = makeTaskWithAssignees({ id: 't1', external_source: 'native' });
    render(<TaskDetailExternalCard task={task} />);
    expect(screen.getByText('Source')).toBeInTheDocument();
    expect(screen.getByText('External id')).toBeInTheDocument();
    expect(screen.getByText('ETag')).toBeInTheDocument();
    expect(screen.getByText('Synced')).toBeInTheDocument();
  });

  it('renders native values for a native task (em-dashes and "never")', () => {
    const task = makeTaskWithAssignees({
      id: 't1',
      external_source: 'native',
      external_id: null,
      external_etag: null,
      external_synced_at: null,
    });
    render(<TaskDetailExternalCard task={task} />);
    expect(screen.getByText('native')).toBeInTheDocument();
    expect(screen.getByText('never')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('flows m365 values through when external_source is m365', () => {
    const task = makeTaskWithAssignees({
      id: 't1',
      external_source: 'm365',
      external_id: 'ext-123',
      external_etag: 'W/"abc"',
      external_synced_at: '2026-05-10T12:00:00Z',
    });
    render(<TaskDetailExternalCard task={task} />);
    expect(screen.getByText('m365')).toBeInTheDocument();
    expect(screen.getByText('ext-123')).toBeInTheDocument();
    expect(screen.getByText('W/"abc"')).toBeInTheDocument();
  });

  it('renders a disabled "Link to MS Planner task…" button with Spec 2 tooltip', () => {
    const task = makeTaskWithAssignees({ id: 't1' });
    render(<TaskDetailExternalCard task={task} />);
    const btn = screen.getByRole('button', { name: /Link to MS Planner task/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', 'Available in Spec 2');
  });

  it('does not call any network when the link button is interacted with', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const linkSpy = vi.fn();
    server.use(
      http.post('/api/planner/v1/tasks/:id/link-m365', () => {
        linkSpy();
        return HttpResponse.json({});
      }),
    );

    const task = makeTaskWithAssignees({ id: 't1' });
    render(<TaskDetailExternalCard task={task} />);
    const btn = screen.getByRole('button', { name: /Link to MS Planner task/i });
    await user.click(btn).catch(() => undefined);
    expect(linkSpy).not.toHaveBeenCalled();
  });
});
