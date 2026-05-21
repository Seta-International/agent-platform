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

    expect(onCreateTask).toHaveBeenCalledWith({ title: 'New' });
    expect(screen.queryByPlaceholderText('Add a task…')).not.toBeInTheDocument();
  });

  it('keeps the "More options" disclosure collapsed by default', () => {
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

    expect(screen.queryByLabelText('Start')).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Preview type' })).not.toBeInTheDocument();
  });

  it('expands "More options" and forwards start_at, priority_number, and preview_type', () => {
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
    fireEvent.change(screen.getByPlaceholderText('Add a task…'), {
      target: { value: 'With details' },
    });
    fireEvent.click(screen.getByText('More options'));

    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '2026-06-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Urgent' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Checklist' }));

    fireEvent.keyDown(screen.getByPlaceholderText('Add a task…'), { key: 'Enter' });

    expect(onCreateTask).toHaveBeenCalledTimes(1);
    expect(onCreateTask).toHaveBeenCalledWith({
      title: 'With details',
      start_at: '2026-06-15',
      priority_number: 1,
      preview_type: 'checklist',
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
    fireEvent.change(screen.getByPlaceholderText('Add a task…'), {
      target: { value: 'Plain' },
    });
    fireEvent.click(screen.getByText('More options'));
    fireEvent.keyDown(screen.getByPlaceholderText('Add a task…'), { key: 'Enter' });

    expect(onCreateTask).toHaveBeenCalledWith({ title: 'Plain' });
  });
});
