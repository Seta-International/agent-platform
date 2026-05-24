import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KanbanColumn } from '../../../src/composites/kanban-column';

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

  it('reveals the compose input on click and fires onCreateTask on Enter', () => {
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

    const input = screen.getByPlaceholderText('Task title');
    expect(input).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'New' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onCreateTask).toHaveBeenCalledWith({ title: 'New' });
    expect(screen.queryByPlaceholderText('Task title')).not.toBeInTheDocument();
  });

  it('exposes Priority and Due chips inline (no "More options" disclosure)', () => {
    render(
      <KanbanColumn
        name="Todo"
        count={0}
        onCreateTask={() => {}}
        droppable={{}}
        draggableHandle={{}}
      >
        <span />
      </KanbanColumn>,
    );
    fireEvent.click(screen.getByText('+ Add a task'));

    expect(screen.getByRole('button', { name: 'Priority' })).toBeInTheDocument();
    expect(screen.getByLabelText('Due')).toBeInTheDocument();
    // The legacy "More options" toggle is gone.
    expect(screen.queryByText('More options')).not.toBeInTheDocument();
  });

  it('forwards due_at and priority_number to onCreateTask', () => {
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
    fireEvent.change(screen.getByPlaceholderText('Task title'), {
      target: { value: 'With details' },
    });
    fireEvent.change(screen.getByLabelText('Due'), { target: { value: '2026-06-15' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(onCreateTask).toHaveBeenCalledTimes(1);
    expect(onCreateTask).toHaveBeenCalledWith({
      title: 'With details',
      due_at: '2026-06-15',
    });
  });

  it('omits default-valued extras from the payload', () => {
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
    fireEvent.change(screen.getByPlaceholderText('Task title'), {
      target: { value: 'Plain' },
    });
    fireEvent.keyDown(screen.getByPlaceholderText('Task title'), { key: 'Enter' });

    expect(onCreateTask).toHaveBeenCalledWith({ title: 'Plain' });
  });
});
