import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KanbanBoard } from '../../../src/composites/kanban-board';

describe('KanbanBoard', () => {
  it('renders children and reveals an inline compose when the Add bucket trigger is clicked', () => {
    const onAddBucket = vi.fn();

    render(
      <KanbanBoard onAddBucket={onAddBucket}>
        <div data-testid="col-1">Column 1</div>
        <div data-testid="col-2">Column 2</div>
      </KanbanBoard>,
    );

    expect(screen.getByTestId('col-1')).toBeInTheDocument();
    expect(screen.getByTestId('col-2')).toBeInTheDocument();

    const trigger = screen.getByRole('button', { name: /add another bucket/i });
    fireEvent.click(trigger);

    // Trigger swaps in-place for the input — typing nothing keeps Add disabled.
    const input = screen.getByLabelText(/new bucket name/i);
    expect(input).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^add bucket$/i })).toBeDisabled();
    expect(onAddBucket).not.toHaveBeenCalled();
  });

  it('submits the typed name on Enter and keeps the input open for another (Trello loop)', () => {
    const onAddBucket = vi.fn();

    render(
      <KanbanBoard onAddBucket={onAddBucket}>
        <div data-testid="col-1">Column 1</div>
      </KanbanBoard>,
    );

    fireEvent.click(screen.getByRole('button', { name: /add another bucket/i }));
    const input = screen.getByLabelText(/new bucket name/i) as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'Backlog' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAddBucket).toHaveBeenNthCalledWith(1, 'Backlog');

    // Input stays open and is cleared, ready for the next bucket.
    expect(screen.getByLabelText(/new bucket name/i)).toBeInTheDocument();
    expect((screen.getByLabelText(/new bucket name/i) as HTMLInputElement).value).toBe('');

    fireEvent.change(screen.getByLabelText(/new bucket name/i), {
      target: { value: 'In progress' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^add bucket$/i }));
    expect(onAddBucket).toHaveBeenNthCalledWith(2, 'In progress');
    expect(onAddBucket).toHaveBeenCalledTimes(2);
  });

  it('trims whitespace and ignores empty submissions', () => {
    const onAddBucket = vi.fn();

    render(
      <KanbanBoard onAddBucket={onAddBucket}>
        <div />
      </KanbanBoard>,
    );

    fireEvent.click(screen.getByRole('button', { name: /add another bucket/i }));
    const input = screen.getByLabelText(/new bucket name/i);

    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAddBucket).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '  Review  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAddBucket).toHaveBeenCalledWith('Review');
  });

  it('Escape closes the compose without submitting', () => {
    const onAddBucket = vi.fn();

    render(
      <KanbanBoard onAddBucket={onAddBucket}>
        <div />
      </KanbanBoard>,
    );

    fireEvent.click(screen.getByRole('button', { name: /add another bucket/i }));
    const input = screen.getByLabelText(/new bucket name/i);
    fireEvent.change(input, { target: { value: 'Done' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onAddBucket).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/new bucket name/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add another bucket/i })).toBeInTheDocument();
  });

  it('does NOT render the Add bucket trigger when onAddBucket is undefined (permission-degraded view)', () => {
    render(
      <KanbanBoard>
        <div data-testid="col-1">Column 1</div>
      </KanbanBoard>,
    );

    expect(screen.queryByRole('button', { name: /add another bucket/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('col-1')).toBeInTheDocument();
  });
});
