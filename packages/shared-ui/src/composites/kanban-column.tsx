// biome-ignore-all lint/a11y/noAutofocus: autoFocus is intentional UX on inline compose input after the user opens it.
import { CalendarDays, GripVertical, MoreHorizontal, Plus } from 'lucide-react';
import {
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../primitives/dropdown-menu';
import { KbdHint } from './kbd-hint';

export interface QuickCreateTaskInput {
  title: string;
  due_at?: string;
  priority_number?: 1 | 3 | 5 | 9;
}

export interface KanbanColumnProps {
  name: string;
  count: number;
  status?: 'muted' | 'primary' | 'warning' | 'success';
  children: ReactNode;
  onCreateTask?: (input: QuickCreateTaskInput) => void;
  onRename?: (name: string) => void;
  onDelete?: () => void;
  droppable: {
    ref?: (el: HTMLElement | null) => void;
    rootProps?: HTMLAttributes<HTMLElement>;
    isDraggingOver?: boolean;
    placeholder?: ReactNode;
  };
  draggableHandle: {
    ref?: (el: HTMLElement | null) => void;
    rootProps?: HTMLAttributes<HTMLElement>;
    handleProps?: HTMLAttributes<HTMLElement>;
    isDragging?: boolean;
    extraStyle?: CSSProperties;
  };
}

const PRIORITY_OPTIONS = [
  { value: 1 as const, label: 'Urgent', dotClass: 'bg-semantic-danger' },
  { value: 3 as const, label: 'Important', dotClass: 'bg-semantic-warning' },
  { value: 5 as const, label: 'Medium', dotClass: 'bg-semantic-info' },
  { value: 9 as const, label: 'Low', dotClass: 'bg-ink-tertiary' },
];

const DEFAULT_PRIORITY: 1 | 3 | 5 | 9 = 5;

export function KanbanColumn({
  name,
  count,
  status,
  children,
  onCreateTask,
  onRename,
  onDelete,
  droppable,
  draggableHandle,
}: KanbanColumnProps) {
  const [composing, setComposing] = useState(false);
  const [value, setValue] = useState('');
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [priority, setPriority] = useState<1 | 3 | 5 | 9>(DEFAULT_PRIORITY);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const headerRef = useRef<HTMLElement>(null);
  const cancelledRef = useRef(false);
  const committedRef = useRef(false);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  function resetCompose() {
    setValue('');
    setDueAt(null);
    setPriority(DEFAULT_PRIORITY);
    setComposing(false);
  }

  function submit() {
    const v = value.trim();
    if (!v || !onCreateTask) {
      resetCompose();
      return;
    }
    const payload: QuickCreateTaskInput = { title: v };
    if (dueAt) payload.due_at = dueAt;
    if (priority !== DEFAULT_PRIORITY) payload.priority_number = priority;
    onCreateTask(payload);
    resetCompose();
  }

  function openRename() {
    setMenuOpen(false);
    setRenameValue(name);
    cancelledRef.current = false;
    committedRef.current = false;
    setRenaming(true);
  }

  function commitRename() {
    if (cancelledRef.current || committedRef.current) return;
    committedRef.current = true;
    const v = renameValue.trim();
    if (v && v !== name) onRename?.(v);
    setRenaming(false);
  }

  const priorityOpt = PRIORITY_OPTIONS.find((o) => o.value === priority) ?? PRIORITY_OPTIONS[2];

  return (
    <section
      ref={draggableHandle.ref}
      {...draggableHandle.rootProps}
      style={draggableHandle.extraStyle}
      className={['kanban-column', draggableHandle.isDragging && 'kanban-column--dragging']
        .filter(Boolean)
        .join(' ')}
      aria-label={`Bucket: ${name}`}
    >
      <header ref={headerRef} className="kanban-column__header">
        {/* Disable DnD handle props on the drag area while the rename input is active so
            mousedown on the input doesn't start a column drag. */}
        <div
          className="kanban-column__drag-handle"
          {...(!renaming ? draggableHandle.handleProps : {})}
        >
          <GripVertical size={12} className="kanban-column__grip" aria-hidden="true" />
          <span className={`status-dot status-dot--${status ?? 'muted'}`} aria-hidden="true" />
          {renaming ? (
            <>
              <input
                className="kanban-column__rename-input"
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') {
                    cancelledRef.current = true;
                    setRenaming(false);
                  }
                }}
                onBlur={commitRename}
              />
              <KbdHint keys={['↵']} />
            </>
          ) : (
            <>
              <span className="kanban-column__name">{name}</span>
              <span className="kanban-column__count">{count}</span>
            </>
          )}
        </div>

        {!renaming && (
          <div className="kanban-column__header-actions">
            {onCreateTask && (
              <button
                type="button"
                className="kanban-column__action-btn"
                title="Add task (C)"
                onClick={() => setComposing(true)}
              >
                <Plus size={12} />
              </button>
            )}
            <button
              type="button"
              className={[
                'kanban-column__action-btn',
                menuOpen && 'kanban-column__action-btn--active',
              ]
                .filter(Boolean)
                .join(' ')}
              title="More options"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <MoreHorizontal size={12} />
            </button>
          </div>
        )}

        {menuOpen && (
          <div className="kanban-column__menu" role="menu">
            <button
              type="button"
              className="kanban-column__menu-item"
              role="menuitem"
              onClick={openRename}
            >
              Rename bucket
              <span className="kanban-column__menu-kbd">R</span>
            </button>
            <button
              type="button"
              className="kanban-column__menu-item"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                setComposing(true);
              }}
            >
              Add task here
              <span className="kanban-column__menu-kbd">C</span>
            </button>
            <button
              type="button"
              className="kanban-column__menu-item"
              role="menuitem"
              aria-disabled="true"
            >
              Set color
            </button>
            <button
              type="button"
              className="kanban-column__menu-item"
              role="menuitem"
              aria-disabled="true"
            >
              Set WIP limit
            </button>
            <hr className="kanban-column__menu-sep" />
            <button
              type="button"
              className="kanban-column__menu-item"
              role="menuitem"
              aria-disabled="true"
            >
              Archive bucket
            </button>
            {onDelete && (
              <button
                type="button"
                className="kanban-column__menu-item kanban-column__menu-item--danger"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
              >
                Delete bucket
              </button>
            )}
          </div>
        )}
      </header>

      {!composing && onCreateTask && (
        <button
          type="button"
          className="kanban-column__quick-create"
          onClick={() => setComposing(true)}
          title="Add a task (C)"
        >
          + Add a task
          <KbdHint keys={['C']} className="ml-1" />
        </button>
      )}

      {composing && (
        <div className="kanban-column__compose">
          <input
            placeholder="Task title"
            value={value}
            autoFocus
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') resetCompose();
            }}
          />
          <div className="kanban-column__compose-chips">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="kanban-column__compose-chip"
                  aria-label="Priority"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <span
                    className={`inline-block size-2 rounded-sm ${priorityOpt?.dotClass ?? ''}`}
                    aria-hidden
                  />
                  <span>{priorityOpt?.label ?? 'Priority'}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {PRIORITY_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    onSelect={() => setPriority(opt.value)}
                    className="flex items-center gap-2"
                  >
                    <span
                      className={`inline-block size-2 rounded-sm ${opt.dotClass}`}
                      aria-hidden
                    />
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <label className="kanban-column__compose-chip kanban-column__compose-chip--input">
              <CalendarDays className="size-3 text-ink-subtle" aria-hidden />
              <input
                type="date"
                aria-label="Due"
                value={dueAt ?? ''}
                onChange={(e) => setDueAt(e.currentTarget.value || null)}
                onMouseDown={(e) => e.stopPropagation()}
              />
            </label>
          </div>
          <div className="kanban-column__compose-footer">
            <span className="kanban-column__compose-hint">
              <KbdHint keys={['↵']} /> add
            </span>
            <div className="kanban-column__compose-actions">
              <button
                type="button"
                className="kanban-column__compose-btn"
                onMouseDown={(e) => e.preventDefault()}
                onClick={resetCompose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="kanban-column__compose-btn kanban-column__compose-btn--primary"
                onMouseDown={(e) => e.preventDefault()}
                onClick={submit}
                disabled={!value.trim()}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        ref={droppable.ref}
        {...droppable.rootProps}
        className={['kanban-column__list', droppable.isDraggingOver && 'kanban-column__list--over']
          .filter(Boolean)
          .join(' ')}
      >
        {children}
        {droppable.placeholder}
      </div>
    </section>
  );
}
