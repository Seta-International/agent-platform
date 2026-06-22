import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KanbanCardShell } from '../../../src/composites/kanban-card-shell';

describe('KanbanCardShell', () => {
  it('renders children inside a role=button with the given aria-label', () => {
    render(
      <KanbanCardShell ariaLabel="Candidate: Ada" draggable={{}}>
        <div>Ada</div>
      </KanbanCardShell>,
    );
    const card = screen.getByRole('button', { name: 'Candidate: Ada' });
    expect(card).toHaveClass('kanban-card');
    expect(screen.getByText('Ada')).toBeInTheDocument();
  });

  it('applies state classes', () => {
    render(
      <KanbanCardShell ariaLabel="x" draggable={{ isDragging: true }} selected recentlyMoved>
        <div />
      </KanbanCardShell>,
    );
    const card = screen.getByRole('button', { name: 'x' });
    expect(card.className).toContain('kanban-card--selected');
    expect(card.className).toContain('kanban-card--recently-moved');
    expect(card.className).toContain('kanban-card--dragging');
  });

  it('renders the saving indicator only when saving', () => {
    const { rerender } = render(
      <KanbanCardShell ariaLabel="x" draggable={{}}>
        <div />
      </KanbanCardShell>,
    );
    expect(screen.queryByTestId('saving-indicator')).toBeNull();
    rerender(
      <KanbanCardShell ariaLabel="x" draggable={{}} saving>
        <div />
      </KanbanCardShell>,
    );
    expect(screen.getByTestId('saving-indicator')).toBeInTheDocument();
  });

  it('calls onOpen on click and on Enter/Space', () => {
    const onOpen = vi.fn();
    render(
      <KanbanCardShell ariaLabel="x" draggable={{}} onOpen={onOpen}>
        <div />
      </KanbanCardShell>,
    );
    const card = screen.getByRole('button', { name: 'x' });
    fireEvent.click(card);
    fireEvent.keyDown(card, { key: 'Enter' });
    fireEvent.keyDown(card, { key: ' ' });
    expect(onOpen).toHaveBeenCalledTimes(3);
  });
});
