import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KanbanColumn } from './kanban-column';

describe('KanbanColumn', () => {
  it('renders the header (name + count) and the children slot', () => {
    render(
      <KanbanColumn name="In Progress" count={3} droppable={{}} draggableHandle={{}}>
        <div data-testid="card-list">cards</div>
      </KanbanColumn>,
    );

    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByTestId('card-list')).toBeInTheDocument();
  });

  it('reveals the quick-create input on click and fires onCreateTask on Enter', () => {
    const onCreateTask = vi.fn();

    render(
      <KanbanColumn
        name="Todo"
        count={0}
        onCreateTask={onCreateTask}
        droppable={{}}
        draggableHandle={{}}
      >
        <span />
      </KanbanColumn>,
    );

    fireEvent.click(screen.getByText('+ Add a task'));

    const input = screen.getByPlaceholderText('Add a task…');
    expect(input).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'New' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onCreateTask).toHaveBeenCalledWith('New');
    expect(screen.queryByPlaceholderText('Add a task…')).not.toBeInTheDocument();
  });
});
