import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KanbanColumn } from '../../../src/composites/kanban-column';

const noopHandle = {
  ref: undefined as undefined,
  rootProps: {} as React.HTMLAttributes<HTMLElement>,
  handleProps: {} as React.HTMLAttributes<HTMLElement>,
  isDragging: false,
  extraStyle: {} as React.CSSProperties,
};
const noopDrop = {
  ref: undefined as undefined,
  rootProps: {} as React.HTMLAttributes<HTMLElement>,
  isDraggingOver: false,
};

function col(overrides: Partial<React.ComponentProps<typeof KanbanColumn>> = {}) {
  return render(
    <KanbanColumn
      name="Todo"
      count={3}
      status="muted"
      draggableHandle={noopHandle}
      droppable={noopDrop}
      {...overrides}
    >
      <div data-testid="child" />
    </KanbanColumn>,
  );
}

describe('<KanbanColumn> header', () => {
  it('renders name and count', () => {
    col();
    expect(screen.getByText('Todo')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows Add task and More options buttons when callbacks provided', () => {
    col({ onCreateTask: vi.fn(), onDelete: vi.fn() });
    expect(screen.getByTitle('Add task (C)')).toBeInTheDocument();
    expect(screen.getByTitle('More options')).toBeInTheDocument();
  });
});

describe('<KanbanColumn> dropdown menu', () => {
  it('is hidden by default', () => {
    col({ onDelete: vi.fn() });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens when More options button is clicked', () => {
    col({ onDelete: vi.fn() });
    fireEvent.click(screen.getByTitle('More options'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('closes when More options button is clicked again', () => {
    col({ onDelete: vi.fn() });
    const btn = screen.getByTitle('More options');
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes when clicking outside the header', () => {
    col({ onDelete: vi.fn() });
    fireEvent.click(screen.getByTitle('More options'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('calls onDelete when Delete bucket… is clicked', () => {
    const onDelete = vi.fn();
    col({ onDelete });
    fireEvent.click(screen.getByTitle('More options'));
    fireEvent.click(screen.getByRole('menuitem', { name: /delete bucket/i }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('does not render Delete button when onDelete is not provided', () => {
    col({ onRename: vi.fn() });
    fireEvent.click(screen.getByTitle('More options'));
    expect(screen.queryByRole('menuitem', { name: /delete bucket/i })).not.toBeInTheDocument();
  });
});

describe('<KanbanColumn> inline rename', () => {
  it('shows rename input after clicking Rename bucket in menu', () => {
    col({ onRename: vi.fn() });
    fireEvent.click(screen.getByTitle('More options'));
    fireEvent.click(screen.getByRole('menuitem', { name: /rename bucket/i }));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('pre-populates the rename input with the current name', () => {
    col({ onRename: vi.fn() });
    fireEvent.click(screen.getByTitle('More options'));
    fireEvent.click(screen.getByRole('menuitem', { name: /rename bucket/i }));
    expect(screen.getByRole<HTMLInputElement>('textbox').value).toBe('Todo');
  });

  it('calls onRename with the new value on Enter', () => {
    const onRename = vi.fn();
    col({ onRename });
    fireEvent.click(screen.getByTitle('More options'));
    fireEvent.click(screen.getByRole('menuitem', { name: /rename bucket/i }));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Backlog' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRename).toHaveBeenCalledWith('Backlog');
  });

  it('does not call onRename on Escape', () => {
    const onRename = vi.fn();
    col({ onRename });
    fireEvent.click(screen.getByTitle('More options'));
    fireEvent.click(screen.getByRole('menuitem', { name: /rename bucket/i }));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(onRename).not.toHaveBeenCalled();
  });

  it('hides action buttons while renaming', () => {
    col({ onRename: vi.fn(), onCreateTask: vi.fn() });
    fireEvent.click(screen.getByTitle('More options'));
    fireEvent.click(screen.getByRole('menuitem', { name: /rename bucket/i }));
    expect(screen.queryByTitle('Add task (C)')).not.toBeInTheDocument();
    expect(screen.queryByTitle('More options')).not.toBeInTheDocument();
  });

  it('restores name/count display after rename is committed', () => {
    col({ onRename: vi.fn() });
    fireEvent.click(screen.getByTitle('More options'));
    fireEvent.click(screen.getByRole('menuitem', { name: /rename bucket/i }));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(screen.getByText('Todo')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('calls onRename exactly once on Enter (no double-call from blur)', () => {
    const onRename = vi.fn();
    col({ onRename });
    fireEvent.click(screen.getByTitle('More options'));
    fireEvent.click(screen.getByRole('menuitem', { name: /rename bucket/i }));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Backlog' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    expect(onRename).toHaveBeenCalledOnce();
    expect(onRename).toHaveBeenCalledWith('Backlog');
  });
});

describe('<KanbanColumn> quick-create submit', () => {
  it('fires onCreateTask with title only when no extras are set', () => {
    const onCreateTask = vi.fn();
    col({ onCreateTask });
    fireEvent.click(screen.getByTitle('Add a task (C)'));
    fireEvent.change(screen.getByPlaceholderText('Add a task…'), { target: { value: 'My task' } });
    fireEvent.keyDown(screen.getByPlaceholderText('Add a task…'), { key: 'Enter' });
    expect(onCreateTask).toHaveBeenCalledWith({ title: 'My task' });
  });

  it('keeps the "More options" disclosure collapsed by default', () => {
    const onCreateTask = vi.fn();
    col({ onCreateTask });
    fireEvent.click(screen.getByTitle('Add a task (C)'));
    // The compose "More options" toggle button is present (identified by aria-expanded attribute)
    expect(screen.getByText('More options')).toBeInTheDocument();
    // But the expanded panel contents (DatePill, PrioritySegmented, PreviewTypeRadio) are not shown
    expect(screen.queryByLabelText('Start')).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: /preview type/i })).not.toBeInTheDocument();
  });

  it('expands "More options" and forwards start_at, priority_number, and preview_type', () => {
    const onCreateTask = vi.fn();
    col({ onCreateTask });
    fireEvent.click(screen.getByTitle('Add a task (C)'));
    fireEvent.change(screen.getByPlaceholderText('Add a task…'), {
      target: { value: 'With details' },
    });
    // Expand the compose-area More options disclosure (has text content "More options")
    fireEvent.click(screen.getByText('More options'));
    // DatePill, PrioritySegmented, and PreviewTypeRadio are now visible
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
});
