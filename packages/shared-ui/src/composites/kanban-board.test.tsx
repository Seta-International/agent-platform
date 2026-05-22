import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KanbanBoard } from './kanban-board';

describe('KanbanBoard', () => {
  it('renders children and the Add bucket button when onAddBucket is provided; clicking fires the callback', () => {
    const onAddBucket = vi.fn();

    render(
      <KanbanBoard onAddBucket={onAddBucket}>
        <div data-testid="col-1">Column 1</div>
        <div data-testid="col-2">Column 2</div>
      </KanbanBoard>,
    );

    expect(screen.getByTestId('col-1')).toBeInTheDocument();
    expect(screen.getByTestId('col-2')).toBeInTheDocument();

    const btn = screen.getByRole('button', { name: /add bucket/i });
    expect(btn).toBeInTheDocument();

    fireEvent.click(btn);
    expect(onAddBucket).toHaveBeenCalledTimes(1);
  });

  it('does NOT render the Add bucket button when onAddBucket is undefined (permission-degraded view)', () => {
    render(
      <KanbanBoard>
        <div data-testid="col-1">Column 1</div>
      </KanbanBoard>,
    );

    expect(screen.queryByRole('button', { name: /add bucket/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('col-1')).toBeInTheDocument();
  });
});
