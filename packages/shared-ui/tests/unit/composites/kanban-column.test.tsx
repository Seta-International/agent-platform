import { LayoutContent } from '@astryxdesign/core/Layout';
import * as stylex from '@stylexjs/stylex';
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

// In the error state there are two role="alert" elements (our inline error
// `<Text role="alert">` plus the Due DateInput's always-mounted VisuallyHidden
// announcer), so `findByRole('alert')` fails with "Found multiple elements" —
// filter by text content instead.
async function findAlertWithText(text: string) {
  return waitFor(() => {
    const alert = screen.getAllByRole('alert').find((el) => el.textContent === text);
    if (!alert) throw new Error(`No role="alert" element with text "${text}" yet`);
    return alert;
  });
}

function col(overrides: Partial<React.ComponentProps<typeof KanbanColumn>> = {}) {
  return render(
    <KanbanColumn
      name="Todo"
      count={3}
      status="neutral"
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
    expect(screen.getByRole('button', { name: 'Add task' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More options' })).toBeInTheDocument();
  });
});

describe('<KanbanColumn> dropdown menu', () => {
  it('is hidden by default', () => {
    col({ onDelete: vi.fn() });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens when More options button is clicked', () => {
    col({ onDelete: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('closes when More options button is clicked again', () => {
    col({ onDelete: vi.fn() });
    const btn = screen.getByRole('button', { name: 'More options' });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('calls onDelete when Delete bucket… is clicked', () => {
    const onDelete = vi.fn();
    col({ onDelete });
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /delete bucket/i }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('does not render Delete button when onDelete is not provided', () => {
    col({ onRename: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.queryByRole('menuitem', { name: /delete bucket/i })).not.toBeInTheDocument();
  });
});

describe('<KanbanColumn> inline rename', () => {
  it('shows rename input after clicking Rename bucket in menu', () => {
    col({ onRename: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /rename bucket/i }));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('pre-populates the rename input with the current name', () => {
    col({ onRename: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /rename bucket/i }));
    expect(screen.getByRole<HTMLInputElement>('textbox').value).toBe('Todo');
  });

  it('calls onRename with the new value on Enter', () => {
    const onRename = vi.fn();
    col({ onRename });
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /rename bucket/i }));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Backlog' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRename).toHaveBeenCalledWith('Backlog');
  });

  it('does not call onRename on Escape', () => {
    const onRename = vi.fn();
    col({ onRename });
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /rename bucket/i }));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(onRename).not.toHaveBeenCalled();
  });

  it('hides action buttons while renaming', () => {
    col({ onRename: vi.fn(), onCreateTask: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /rename bucket/i }));
    expect(screen.queryByRole('button', { name: 'Add task' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More options' })).not.toBeInTheDocument();
  });

  it('restores name/count display after rename is committed', () => {
    col({ onRename: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /rename bucket/i }));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(screen.getByText('Todo')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('calls onRename exactly once on Enter (no double-call from blur)', () => {
    const onRename = vi.fn();
    col({ onRename });
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
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
    expect(screen.getByRole('combobox', { name: 'Due' })).toBeInTheDocument();
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
    fireEvent.change(screen.getByRole('combobox', { name: 'Due' }), {
      target: { value: '2026-06-15' },
    });
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
      expect(dot?.getAttribute('style') ?? '', `color for ${label}`).toContain('--color-icon-');
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

    // findAlertWithText's own throw-based wait already asserts a role="alert"
    // element with this exact text appears; re-asserting the same text here
    // would be tautological.
    await findAlertWithText('Task title cannot exceed 255 characters.');
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

    // findAlertWithText's own throw-based wait already asserts a role="alert"
    // element with this exact text appears; re-asserting the same text here
    // would be tautological.
    await findAlertWithText('Task title cannot exceed 255 characters.');
    expect(screen.getByPlaceholderText('Task title')).toBeInTheDocument();
  });
});

describe('KanbanColumn bucket actions', () => {
  it('calls onSetColor / onSetWipLimit / onArchive from the menu', async () => {
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
    // Astryx's DropdownMenu debounces the trigger for ~50ms after it auto-closes
    // (an iOS Safari guard against pointerdown-before-click reopening a menu that
    // was just light-dismissed). Real users always clear this window; back-to-back
    // fireEvent.click reopen attempts within the same tick don't, so each reopen
    // cycle below waits past it.
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Set color' }));
    expect(onSetColor).toHaveBeenCalledOnce();
    await new Promise((resolve) => setTimeout(resolve, 60));

    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Set WIP limit' }));
    expect(onSetWipLimit).toHaveBeenCalledOnce();
    await new Promise((resolve) => setTimeout(resolve, 60));

    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
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
    expect(badge.closest('[data-over-limit="true"]')).not.toBeNull();
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
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
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
    const dot = container.querySelector('[data-kanban-status-dot]') as HTMLElement;
    expect(dot).not.toBeNull();
    expect(dot.style.backgroundColor).not.toBe('');
  });

  it('leaves the status dot background unstyled when color is absent', () => {
    const { container } = render(
      <KanbanColumn name="To do" count={3} droppable={{}}>
        {null}
      </KanbanColumn>,
    );
    const dot = container.querySelector('[data-kanban-status-dot]') as HTMLElement;
    expect(dot).not.toBeNull();
    expect(dot.style.backgroundColor).toBe('');
  });
});

describe('<KanbanColumn> Delete bucket danger styling', () => {
  // Astryx Item renders the label in its own <span> whose class sets an explicit
  // `color: var(--color-text-primary)`, so an xstyle colour on the menuitem ROOT is
  // only inherited and never reaches the text. The danger colour must land on the
  // label element itself.
  //
  // StyleX class names are a content hash of the declaration, so an identical
  // `color: var(--color-error)` created here yields the very same class the composite
  // uses — that keeps this self-calibrating instead of hardcoding a hash.
  const probe = stylex.create({ danger: { color: 'var(--color-error)' } });

  function dangerClass() {
    // dev-mode props also carry a `<file>__styles.<key>` debug marker; keep the real class.
    const cls = stylex
      .props(probe.danger)
      .className?.split(/\s+/)
      .filter((c) => /^x[a-z0-9]+$/i.test(c));
    if (!cls?.length) throw new Error('could not derive the danger StyleX class');
    return cls;
  }

  // All three nested label spans share the same textContent, so take the DEEPEST match —
  // the outermost wrapper is identical between items and would compare equal either way.
  function labelElementFor(name: string) {
    const item = screen.getByRole('menuitem', { name });
    const matches = Array.from(item.querySelectorAll('*')).filter((n) => n.textContent === name);
    const el = matches.at(-1);
    if (!el) throw new Error(`no label element for "${name}"`);
    return el as HTMLElement;
  }

  it('colours the Delete label element itself, not just the menuitem root', () => {
    col({ onDelete: vi.fn(), onArchive: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));

    const danger = dangerClass();
    const deleteLabel = labelElementFor('Delete bucket');
    const neutralLabel = labelElementFor('Archive bucket');

    // Root-only styling (the regression) leaves the danger class off the label entirely.
    expect(danger.every((c) => deleteLabel.classList.contains(c))).toBe(true);
    expect(danger.some((c) => neutralLabel.classList.contains(c))).toBe(false);
  });

  it('keeps the Delete accessible name exactly "Delete bucket" despite the styled label', () => {
    col({ onDelete: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.getByRole('menuitem', { name: 'Delete bucket' })).toBeInTheDocument();
  });
});

describe('<KanbanColumn> disabled menu items keep their exact accessible name', () => {
  it('keeps "Rename bucket" as the exact name (no appended reason) when disabled', () => {
    col({
      onRename: vi.fn(),
      renameDisabledReason: 'You do not have permission to rename this bucket.',
    });
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    // Exact match: if the disabled reason leaked into the accessible name (e.g. via
    // Astryx's `description` prop), this query would not find the item at all.
    const item = screen.getByRole('menuitem', { name: 'Rename bucket' });
    expect(item).toHaveAttribute('aria-disabled', 'true');
  });

  it('keeps "Delete bucket" as the exact name (no appended reason) when disabled', () => {
    col({
      onDelete: vi.fn(),
      deleteDisabledReason: 'You do not have permission to delete this bucket.',
    });
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    const item = screen.getByRole('menuitem', { name: 'Delete bucket' });
    expect(item).toHaveAttribute('aria-disabled', 'true');
  });

  it('keeps "Add task here" as the exact name (no appended reason) when disabled', () => {
    col({
      onCreateTask: vi.fn(),
      onDelete: vi.fn(),
      createTaskDisabledReason: 'You do not have permission to create tasks.',
    });
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    const item = screen.getByRole('menuitem', { name: 'Add task here' });
    expect(item).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('<KanbanColumn> opt-in affordances', () => {
  it('renders no grip handle when draggableHandle is omitted', () => {
    const { container } = render(
      <KanbanColumn name="New" count={2} droppable={{}}>
        <div />
      </KanbanColumn>,
    );
    expect(container.querySelector('[data-kanban-grip]')).toBeNull();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders the grip handle when draggableHandle is provided', () => {
    const { container } = col(); // col() passes noopHandle
    expect(container.querySelector('[data-kanban-grip]')).not.toBeNull();
  });

  it('renders no More options button when neither onRename nor onDelete is provided', () => {
    render(
      <KanbanColumn name="New" count={0} droppable={{}}>
        <div />
      </KanbanColumn>,
    );
    expect(screen.queryByRole('button', { name: 'More options' })).not.toBeInTheDocument();
  });
});

describe('<KanbanColumn> scroll containment', () => {
  // @hello-pangea/dnd resolves a droppable's scroll parent to the FIRST ancestor whose
  // computed overflow is auto/scroll — whether or not it actually overflows. If anything
  // inside the column is a scroll container it shadows `.kanban-board`, which kills board
  // autoscroll during a card drag and lets droppable rects go stale (cards land in the
  // wrong bucket). vitest runs with `css: false`, so computed styles are meaningless here;
  // we compare against the vendor's own class instead.
  //
  // Derive the overflow-scroll class from LayoutContent itself rather than hardcoding the
  // StyleX hash, so an @astryxdesign/core bump re-derives it instead of silently passing.
  function scrollableOnlyClasses() {
    const on = render(<LayoutContent padding={2}>x</LayoutContent>);
    const onClasses = (on.container.firstElementChild as HTMLElement).className.split(/\s+/);
    on.unmount();

    const off = render(
      <LayoutContent padding={2} isScrollable={false}>
        x
      </LayoutContent>,
    );
    const offClasses = new Set(
      (off.container.firstElementChild as HTMLElement).className.split(/\s+/),
    );
    off.unmount();

    return onClasses.filter((c) => c && !offClasses.has(c));
  }

  it('renders no overflow scroll container inside the column, so the board stays pangea’s scroll parent', () => {
    const scrollClasses = scrollableOnlyClasses();
    // Guards the guard: if the vendor stops distinguishing the two, this test would
    // otherwise pass vacuously against an empty class list.
    expect(scrollClasses.length).toBeGreaterThan(0);

    const { container } = render(
      <KanbanColumn name="Todo" count={3} droppable={{}} draggableHandle={{}}>
        <div data-testid="child" />
      </KanbanColumn>,
    );

    const offenders = Array.from(container.querySelectorAll('*')).filter((el) =>
      scrollClasses.some((c) => el.classList.contains(c)),
    );
    expect(offenders.map((el) => el.className)).toEqual([]);
  });
});

describe('<KanbanColumn> fluid width', () => {
  it('applies width as a min-width floor and flexes to fill', () => {
    render(
      <KanbanColumn name="Todo" count={0} width={256} droppable={noopDrop}>
        {null}
      </KanbanColumn>,
    );
    const region = screen.getByRole('region', { name: 'Bucket: Todo' });
    expect(region).toHaveStyle({ minWidth: '256px' });
  });
});

describe('<KanbanColumn> emptyState slot', () => {
  it('renders the emptyState when there are no children', () => {
    render(
      <KanbanColumn
        name="In review"
        count={0}
        droppable={{ ref: () => {}, rootProps: {}, isDraggingOver: false, placeholder: null }}
        emptyState={<div>Nothing here</div>}
      >
        {null}
      </KanbanColumn>,
    );
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('hides the emptyState when children are present', () => {
    render(
      <KanbanColumn
        name="In review"
        count={1}
        droppable={{ ref: () => {}, rootProps: {}, isDraggingOver: false, placeholder: null }}
        emptyState={<div>Nothing here</div>}
      >
        <div>a card</div>
      </KanbanColumn>,
    );
    expect(screen.queryByText('Nothing here')).toBeNull();
    expect(screen.getByText('a card')).toBeInTheDocument();
  });
});

describe('<KanbanColumn> completed section', () => {
  it('toggles completed children via the Collapsible trigger', async () => {
    const user = userEvent.setup();
    render(
      <KanbanColumn
        name="Done"
        count={0}
        droppable={{}}
        completedTasks={{ count: 2, children: <div data-testid="completed-child" /> }}
      >
        {null}
      </KanbanColumn>,
    );
    const trigger = screen.getByRole('button', { name: 'Completed (2)' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders nothing when completedTasks.count is 0', () => {
    render(
      <KanbanColumn
        name="Done"
        count={0}
        droppable={{}}
        completedTasks={{ count: 0, children: <div data-testid="completed-child" /> }}
      >
        {null}
      </KanbanColumn>,
    );
    expect(screen.queryByText(/Completed/)).not.toBeInTheDocument();
  });
});
