import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  it('reveals the compose input on click and fires onCreateTask on Enter', async () => {
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
    await waitFor(() => expect(onCreateTask).toHaveBeenCalledWith({ title: 'New' }));
    await waitFor(() =>
      expect(screen.queryByPlaceholderText('Task title')).not.toBeInTheDocument(),
    );
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
    expect(screen.queryByText('More options')).not.toBeInTheDocument();
  });

  it('forwards due_at to onCreateTask', async () => {
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
    await waitFor(() => expect(onCreateTask).toHaveBeenCalledTimes(1));
    expect(onCreateTask).toHaveBeenCalledWith({ title: 'With details', due_at: '2026-06-15' });
  });

  it('shows a color dot for every priority option (FUT-21)', async () => {
    const user = userEvent.setup();
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
    await user.click(screen.getByRole('button', { name: 'Priority' }));

    // Every option's leading dot must carry a priority color from the shared
    // registry — Urgent and Medium were rendering with no color (FUT-21).
    for (const label of ['Urgent', 'Important', 'Medium', 'Low']) {
      const item = await screen.findByRole('menuitem', { name: label });
      const dot = item.querySelector('span[aria-hidden="true"]');
      expect(dot, `dot for ${label}`).toBeTruthy();
      expect(dot?.getAttribute('style') ?? '', `color for ${label}`).toContain('--color-priority');
    }
  });

  it('omits default-valued extras from the payload', async () => {
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
    fireEvent.change(screen.getByPlaceholderText('Task title'), { target: { value: 'Plain' } });
    fireEvent.keyDown(screen.getByPlaceholderText('Task title'), { key: 'Enter' });
    await waitFor(() => expect(onCreateTask).toHaveBeenCalledWith({ title: 'Plain' }));
  });

  it('shows an inline error and keeps compose open when title exceeds titleMaxLength', async () => {
    const onCreateTask = vi.fn();
    render(
      <KanbanColumn
        name="Todo"
        count={0}
        titleMaxLength={255}
        onCreateTask={onCreateTask}
        droppable={{}}
        draggableHandle={{}}
      >
        <span />
      </KanbanColumn>,
    );
    fireEvent.click(screen.getByText('+ Add a task'));
    const longTitle = 'x'.repeat(256);
    fireEvent.change(screen.getByPlaceholderText('Task title'), { target: { value: longTitle } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Task title cannot exceed 255 characters.',
    );
    expect(screen.getByPlaceholderText('Task title')).toBeInTheDocument();
    expect(onCreateTask).not.toHaveBeenCalled();
  });

  it('does not create a second task when Enter fires again before the first submission resolves (FUT-390)', async () => {
    let resolveCreate!: () => void;
    const onCreateTask = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = resolve;
        }),
    );
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
    fireEvent.change(input, { target: { value: 'Test' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });
    resolveCreate();
    await waitFor(() =>
      expect(screen.queryByPlaceholderText('Task title')).not.toBeInTheDocument(),
    );
    expect(onCreateTask).toHaveBeenCalledTimes(1);
  });

  it('shows an inline error when onCreateTask rejects', async () => {
    render(
      <KanbanColumn
        name="Todo"
        count={0}
        onCreateTask={() => Promise.reject(new Error('Task title cannot exceed 255 characters.'))}
        droppable={{}}
        draggableHandle={{}}
      >
        <span />
      </KanbanColumn>,
    );
    fireEvent.click(screen.getByText('+ Add a task'));
    fireEvent.change(screen.getByPlaceholderText('Task title'), { target: { value: 'Too long' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Task title cannot exceed 255 characters.',
    );
    expect(screen.getByPlaceholderText('Task title')).toBeInTheDocument();
  });
});

describe('KanbanColumn bucket actions', () => {
  it('calls onSetColor / onSetWipLimit / onArchive from the menu', () => {
    const onSetColor = vi.fn();
    const onSetWipLimit = vi.fn();
    const onArchive = vi.fn();
    render(
      <KanbanColumn
        name="To do"
        count={3}
        droppable={{}}
        onSetColor={onSetColor}
        onSetWipLimit={onSetWipLimit}
        onArchive={onArchive}
      >
        {null}
      </KanbanColumn>,
    );
    fireEvent.click(screen.getByTitle('More options'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Set color' }));
    expect(onSetColor).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByTitle('More options'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Set WIP limit' }));
    expect(onSetWipLimit).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByTitle('More options'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive bucket' }));
    expect(onArchive).toHaveBeenCalledOnce();
  });

  it('renders n/limit and marks over-limit', () => {
    render(
      <KanbanColumn name="To do" count={5} wipLimit={3} droppable={{}}>
        {null}
      </KanbanColumn>,
    );
    const badge = screen.getByText('5/3');
    expect(badge).toHaveClass('kanban-column__count--over');
  });

  it('hides only the local actions when isLinked, keeping the rest of the menu', () => {
    render(
      <KanbanColumn
        name="To do"
        count={3}
        droppable={{}}
        isLinked
        onRename={vi.fn()}
        onSetColor={vi.fn()}
        onSetWipLimit={vi.fn()}
        onArchive={vi.fn()}
      >
        {null}
      </KanbanColumn>,
    );
    fireEvent.click(screen.getByTitle('More options'));
    expect(screen.queryByRole('menuitem', { name: 'Set color' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Set WIP limit' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Archive bucket' })).toBeNull();
    // Non-local actions remain available on a linked bucket.
    expect(screen.getByRole('menuitem', { name: /rename bucket/i })).toBeInTheDocument();
  });

  it('applies an inline backgroundColor on the status dot when color is set', () => {
    const { container } = render(
      <KanbanColumn name="To do" count={3} color="#6366f1" droppable={{}}>
        {null}
      </KanbanColumn>,
    );
    const dot = container.querySelector('.status-dot') as HTMLElement;
    expect(dot).not.toBeNull();
    expect(dot.style.backgroundColor).not.toBe('');
  });

  it('leaves the status dot background unstyled when color is absent', () => {
    const { container } = render(
      <KanbanColumn name="To do" count={3} droppable={{}}>
        {null}
      </KanbanColumn>,
    );
    const dot = container.querySelector('.status-dot') as HTMLElement;
    expect(dot).not.toBeNull();
    expect(dot.style.backgroundColor).toBe('');
  });
});

describe('<KanbanColumn> opt-in affordances', () => {
  it('renders no grip handle when draggableHandle is omitted', () => {
    const { container } = render(
      <KanbanColumn name="New" count={2} droppable={{}}>
        <div />
      </KanbanColumn>,
    );
    expect(container.querySelector('.kanban-column__grip')).toBeNull();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders the grip handle when draggableHandle is provided', () => {
    const { container } = col(); // col() passes noopHandle
    expect(container.querySelector('.kanban-column__grip')).not.toBeNull();
  });

  it('renders no More options button when neither onRename nor onDelete is provided', () => {
    render(
      <KanbanColumn name="New" count={0} droppable={{}}>
        <div />
      </KanbanColumn>,
    );
    expect(screen.queryByTitle('More options')).not.toBeInTheDocument();
  });
});
