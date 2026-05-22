import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KanbanCard } from './kanban-card';

const task = {
  id: 't1',
  title: 'Ship M3 spec',
  priority: 'urgent' as const,
  due_label: '2d',
  label: { name: 'api', color: undefined },
  assignees: [
    { user_id: 'u1', display_name: 'Jane Doe' },
    { user_id: 'u2', display_name: 'Mark Lee' },
  ],
  recentlyMoved: false,
  saving: false,
};

describe('KanbanCard', () => {
  it('renders title, priority, due label, label chip, and first assignee initials', () => {
    render(<KanbanCard task={task} draggable={{}} />);

    expect(screen.getByText('Ship M3 spec')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Urgent priority' })).toBeInTheDocument();
    expect(screen.getByText('2d')).toBeInTheDocument();
    expect(screen.getByText('api')).toBeInTheDocument();
    expect(screen.getByTitle('Jane Doe')).toBeInTheDocument();
  });

  it('applies kanban-card--recently-moved class when recentlyMoved is true', () => {
    render(<KanbanCard task={{ ...task, recentlyMoved: true }} draggable={{}} />);

    const article = screen.getByRole('button', { name: /Ship M3 spec/ });
    expect(article.className).toContain('kanban-card--recently-moved');
  });

  it('renders saving indicator when saving is true', () => {
    render(<KanbanCard task={{ ...task, saving: true }} draggable={{}} />);

    expect(screen.getByTestId('saving-indicator')).toBeInTheDocument();
  });

  it('renders previewSlot between the title and the meta footer when provided', () => {
    render(
      <KanbanCard
        task={task}
        draggable={{}}
        previewSlot={<div data-testid="preview-body">first three items</div>}
      />,
    );

    const card = screen.getByRole('button', { name: /Ship M3 spec/ });
    const slot = screen.getByTestId('preview-body');
    expect(slot).toBeInTheDocument();

    const children = Array.from(card.children);
    const titleIdx = children.findIndex((c) => c.classList.contains('kanban-card__title'));
    const slotIdx = children.indexOf(slot);
    const metaIdx = children.findIndex((c) => c.classList.contains('kanban-card__meta'));
    expect(titleIdx).toBeGreaterThan(-1);
    expect(slotIdx).toBeGreaterThan(titleIdx);
    expect(metaIdx).toBeGreaterThan(slotIdx);
  });

  it('omits the preview slot wrapper entirely when previewSlot is undefined', () => {
    const { container } = render(<KanbanCard task={task} draggable={{}} />);
    expect(container.querySelector('[data-role="preview-slot"]')).toBeNull();
  });

  it('renders a mini SyncBadge when external_source is m365', () => {
    render(
      <KanbanCard
        task={{
          ...task,
          external_source: 'm365',
          sync_status: 'idle',
          external_synced_at: '2026-05-22T00:00:00.000Z',
        }}
        draggable={{}}
      />,
    );
    const badge = screen.getByLabelText('Sync idle');
    expect(badge).toBeInTheDocument();
    expect(badge.getAttribute('data-sync-badge-mini')).toBe('true');
  });

  it('does not render a SyncBadge when external_source is native', () => {
    render(
      <KanbanCard
        task={{ ...task, external_source: 'native', sync_status: 'idle' }}
        draggable={{}}
      />,
    );
    expect(screen.queryByLabelText(/^Sync /)).toBeNull();
  });

  it('does not render a SyncBadge when external_source is undefined', () => {
    render(<KanbanCard task={task} draggable={{}} />);
    expect(screen.queryByLabelText(/^Sync /)).toBeNull();
  });
});
