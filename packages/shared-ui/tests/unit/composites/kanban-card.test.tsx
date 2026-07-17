import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KanbanCard, type KanbanCardTask } from '../../../src/composites/kanban-card';

const base: KanbanCardTask = {
  id: 't1',
  title: 'Design the landing page',
  priority: 'urgent',
  due_label: 'Jul 3',
  label: { name: 'Marketing' },
  assignees: [{ user_id: 'u1', display_name: 'Ada Lovelace' }],
};

describe('KanbanCard', () => {
  it('shows priority as a labelled pill in the header', () => {
    render(<KanbanCard task={base} draggable={{}} />);
    expect(screen.getByText('Urgent')).toBeInTheDocument();
    expect(screen.getByLabelText('Urgent priority')).toBeInTheDocument();
  });

  it('puts label, due and avatars in the hairline footer', () => {
    render(<KanbanCard task={base} draggable={{}} />);
    const footer = document.querySelector('[data-role="card-footer"]');
    expect(footer).not.toBeNull();
    expect(footer).toHaveTextContent('Marketing');
    expect(footer).toHaveTextContent('Jul 3');
  });

  it('renders a blocked marker and completed styling', () => {
    render(<KanbanCard task={{ ...base, blocked: true, isCompleted: true }} draggable={{}} />);
    expect(screen.getByLabelText('Blocked')).toBeInTheDocument();
    expect(screen.getByText('Design the landing page')).toBeInTheDocument();
  });

  it('marks the card data-recently-moved when recentlyMoved is true', () => {
    render(<KanbanCard task={{ ...base, recentlyMoved: true }} draggable={{}} />);

    const card = screen.getByRole('button', { name: /Design the landing page/ });
    expect(card).toHaveAttribute('data-recently-moved', 'true');
  });

  it('renders saving indicator when saving is true', () => {
    render(<KanbanCard task={{ ...base, saving: true }} draggable={{}} />);

    expect(screen.getByTestId('saving-indicator')).toBeInTheDocument();
  });

  it('renders previewSlot between the title and the hairline footer when provided', () => {
    render(
      <KanbanCard
        task={base}
        draggable={{}}
        previewSlot={<div data-testid="preview-body">first three items</div>}
      />,
    );

    const card = screen.getByRole('button', { name: /Design the landing page/ });
    const slot = screen.getByTestId('preview-body');
    expect(slot).toBeInTheDocument();

    // Shell wraps header/children/footer in one flex body div — descend one level
    // and locate rows by content rather than the removed `kanban-card__*` classNames.
    const body = card.children[0] as HTMLElement;
    const rows = Array.from(body.children);
    const titleIdx = rows.findIndex((c) => c.textContent?.includes('Design the landing page'));
    const slotIdx = rows.indexOf(slot);
    const footerIdx = rows.findIndex((c) => c.getAttribute('data-role') === 'card-footer');
    expect(titleIdx).toBeGreaterThan(-1);
    expect(slotIdx).toBeGreaterThan(titleIdx);
    expect(footerIdx).toBeGreaterThan(slotIdx);
  });

  it('renders a mini SyncBadge when external_source is m365', () => {
    render(
      <KanbanCard
        task={{
          ...base,
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
        task={{ ...base, external_source: 'native', sync_status: 'idle' }}
        draggable={{}}
      />,
    );
    expect(screen.queryByLabelText(/^Sync /)).toBeNull();
  });

  it('does not render a SyncBadge when external_source is undefined', () => {
    render(<KanbanCard task={base} draggable={{}} />);
    expect(screen.queryByLabelText(/^Sync /)).toBeNull();
  });
});
