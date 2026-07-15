// biome-ignore-all lint/a11y/noAutofocus: autoFocus is intentional UX on inline compose input after the user opens it.
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  GripVertical,
  MoreHorizontal,
  Plus,
} from 'lucide-react';
import {
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { PRIORITY_LEVELS } from '../lib/priority';
import { DropdownMenu, DropdownMenuItem } from '../primitives/dropdown-menu';
import { DisabledActionTooltip } from './disabled-action-tooltip';
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
  completedTasks?: { count: number; children: ReactNode };
  onCreateTask?: (input: QuickCreateTaskInput) => void | Promise<void>;
  /** When set, blocks submit and shows an inline error if the trimmed title exceeds this length. */
  titleMaxLength?: number;
  onRename?: (name: string) => void;
  onDelete?: () => void;
  onSetColor?: () => void;
  onSetWipLimit?: () => void;
  onArchive?: () => void;
  /**
   * When set, the corresponding trigger renders disabled with this reason as a tooltip instead of
   * being interactive — for users who lack the relevant permission. The owning callback is still
   * passed (so the trigger remains visible); the reason gates interaction.
   */
  createTaskDisabledReason?: string;
  renameDisabledReason?: string;
  deleteDisabledReason?: string;
  /** When set, the drag handle is shown disabled (column reorder requires bucket update permission). */
  reorderDisabledReason?: string;
  /** Header status-dot color (hex). null = default status dot. */
  color?: string | null;
  /** WIP limit; null = none. */
  wipLimit?: number | null;
  /** M365-linked bucket: color/wip/archive actions are hidden. */
  isLinked?: boolean;
  droppable: {
    ref?: (el: HTMLElement | null) => void;
    rootProps?: HTMLAttributes<HTMLElement>;
    isDraggingOver?: boolean;
    placeholder?: ReactNode;
  };
  draggableHandle?: {
    ref?: (el: HTMLElement | null) => void;
    rootProps?: HTMLAttributes<HTMLElement>;
    handleProps?: HTMLAttributes<HTMLElement>;
    isDragging?: boolean;
    extraStyle?: CSSProperties;
  };
}

// Derived from the shared priority registry so dots use the same colors as
// PriorityIcon and the task detail panel — never redeclare priority colors here.
const PRIORITY_OPTIONS = PRIORITY_LEVELS.map((p) => ({
  value: p.value,
  label: p.label,
  color: p.color,
}));

const DEFAULT_PRIORITY: 1 | 3 | 5 | 9 = 5;

export function KanbanColumn({
  name,
  count,
  status,
  children,
  completedTasks,
  onCreateTask,
  titleMaxLength,
  onRename,
  onDelete,
  onSetColor,
  onSetWipLimit,
  onArchive,
  createTaskDisabledReason,
  renameDisabledReason,
  deleteDisabledReason,
  reorderDisabledReason,
  color,
  wipLimit,
  isLinked,
  droppable,
  draggableHandle,
}: KanbanColumnProps) {
  const [composing, setComposing] = useState(false);
  const [value, setValue] = useState('');
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [priority, setPriority] = useState<1 | 3 | 5 | 9>(DEFAULT_PRIORITY);
  const [menuOpen, setMenuOpen] = useState(false);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
    setTitleError(null);
    setIsSubmitting(false);
    setComposing(false);
  }

  async function submit() {
    const v = value.trim();
    if (!v || !onCreateTask) {
      resetCompose();
      return;
    }
    if (titleMaxLength !== undefined && v.length > titleMaxLength) {
      setTitleError(`Task title cannot exceed ${titleMaxLength} characters.`);
      return;
    }
    const payload: QuickCreateTaskInput = { title: v };
    if (dueAt) payload.due_at = dueAt;
    if (priority !== DEFAULT_PRIORITY) payload.priority_number = priority;

    setTitleError(null);
    setIsSubmitting(true);
    try {
      await onCreateTask(payload);
      resetCompose();
    } catch (err) {
      setTitleError(err instanceof Error ? err.message : "Couldn't create the task.");
    } finally {
      setIsSubmitting(false);
    }
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

  const handle = draggableHandle;
  const reorderDisabled = Boolean(reorderDisabledReason);
  const localActions = !isLinked;
  const hasMenu = Boolean(
    onRename || onDelete || (localActions && (onSetColor || onSetWipLimit || onArchive)),
  );
  const overLimit = wipLimit != null && count > wipLimit;

  return (
    <section
      ref={handle?.ref}
      {...handle?.rootProps}
      style={handle?.extraStyle}
      className={['kanban-column', handle?.isDragging && 'kanban-column--dragging']
        .filter(Boolean)
        .join(' ')}
      aria-label={`Bucket: ${name}`}
    >
      <header ref={headerRef} className="kanban-column__header">
        <div
          className="kanban-column__drag-handle"
          {...(handle && !renaming && !reorderDisabled ? handle.handleProps : {})}
        >
          {handle &&
            (reorderDisabled ? (
              <DisabledActionTooltip disabled reason={reorderDisabledReason}>
                <GripVertical
                  size={12}
                  className="kanban-column__grip opacity-40"
                  aria-hidden="true"
                />
              </DisabledActionTooltip>
            ) : (
              <GripVertical size={12} className="kanban-column__grip" aria-hidden="true" />
            ))}
          <span
            className={`status-dot status-dot--${status ?? 'muted'}`}
            style={color ? { backgroundColor: color } : undefined}
            aria-hidden="true"
          />
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
              <span
                className={`kanban-column__count${overLimit ? ' kanban-column__count--over' : ''}`}
              >
                {wipLimit != null ? `${count}/${wipLimit}` : count}
              </span>
            </>
          )}
        </div>

        {!renaming && (onCreateTask || hasMenu) && (
          <div className="kanban-column__header-actions">
            {onCreateTask && (
              <DisabledActionTooltip
                disabled={Boolean(createTaskDisabledReason)}
                reason={createTaskDisabledReason}
              >
                <button
                  type="button"
                  className="kanban-column__action-btn"
                  title="Add task"
                  onClick={() => setComposing(true)}
                  disabled={Boolean(createTaskDisabledReason)}
                >
                  <Plus size={12} />
                </button>
              </DisabledActionTooltip>
            )}
            {hasMenu && (
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
            )}
          </div>
        )}

        {menuOpen && (
          <div className="kanban-column__menu" role="menu">
            {onRename && (
              <DisabledActionTooltip
                disabled={Boolean(renameDisabledReason)}
                reason={renameDisabledReason}
              >
                <button
                  type="button"
                  className="kanban-column__menu-item"
                  role="menuitem"
                  onClick={openRename}
                  disabled={Boolean(renameDisabledReason)}
                >
                  Rename bucket
                </button>
              </DisabledActionTooltip>
            )}
            {onCreateTask && (
              <DisabledActionTooltip
                disabled={Boolean(createTaskDisabledReason)}
                reason={createTaskDisabledReason}
              >
                <button
                  type="button"
                  className="kanban-column__menu-item"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setComposing(true);
                  }}
                  disabled={Boolean(createTaskDisabledReason)}
                >
                  Add task here
                </button>
              </DisabledActionTooltip>
            )}
            {localActions && onSetColor && (
              <button
                type="button"
                className="kanban-column__menu-item"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onSetColor();
                }}
              >
                Set color
              </button>
            )}
            {localActions && onSetWipLimit && (
              <button
                type="button"
                className="kanban-column__menu-item"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onSetWipLimit();
                }}
              >
                Set WIP limit
              </button>
            )}
            {localActions && onArchive && (
              <>
                <hr className="kanban-column__menu-sep" />
                <button
                  type="button"
                  className="kanban-column__menu-item"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onArchive();
                  }}
                >
                  Archive bucket
                </button>
              </>
            )}
            {onDelete && (
              <DisabledActionTooltip
                disabled={Boolean(deleteDisabledReason)}
                reason={deleteDisabledReason}
              >
                <button
                  type="button"
                  className="kanban-column__menu-item kanban-column__menu-item--danger"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete();
                  }}
                  disabled={Boolean(deleteDisabledReason)}
                >
                  Delete bucket
                </button>
              </DisabledActionTooltip>
            )}
          </div>
        )}
      </header>

      {!composing && onCreateTask && (
        <DisabledActionTooltip
          disabled={Boolean(createTaskDisabledReason)}
          reason={createTaskDisabledReason}
        >
          <button
            type="button"
            className="kanban-column__quick-create"
            onClick={() => setComposing(true)}
            title="Add a task"
            disabled={Boolean(createTaskDisabledReason)}
          >
            + Add a task
          </button>
        </DisabledActionTooltip>
      )}

      {composing && (
        <div className="kanban-column__compose">
          <input
            placeholder="Task title"
            value={value}
            autoFocus
            aria-invalid={!!titleError}
            onChange={(e) => {
              setValue(e.target.value);
              if (titleError) setTitleError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isSubmitting) void submit();
              if (e.key === 'Escape') resetCompose();
            }}
          />
          {titleError ? (
            <p role="alert" className="kanban-column__compose-error">
              {titleError}
            </p>
          ) : null}
          <div className="kanban-column__compose-chips">
            <DropdownMenu
              placement="below"
              hasChevron={false}
              button={{
                label: 'Priority',
                variant: 'ghost',
                className: 'kanban-column__compose-chip',
                onMouseDown: (e) => e.preventDefault(),
                children: (
                  <>
                    <span
                      className="inline-block size-2 rounded-sm"
                      style={priorityOpt ? { backgroundColor: priorityOpt.color } : undefined}
                      aria-hidden
                    />
                    <span>{priorityOpt?.label ?? 'Priority'}</span>
                  </>
                ),
              }}
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  icon={
                    <span
                      className="inline-block size-2 rounded-sm"
                      style={{ backgroundColor: opt.color }}
                      aria-hidden
                    />
                  }
                  label={opt.label}
                  onClick={() => setPriority(opt.value)}
                />
              ))}
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
                onClick={() => void submit()}
                disabled={!value.trim() || isSubmitting}
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

      {completedTasks && completedTasks.count > 0 && (
        <div className="mt-1">
          <button
            type="button"
            className="flex w-full items-center gap-1 rounded px-2 py-1 text-xs text-ink-tertiary hover:bg-surface-raised"
            onClick={() => setCompletedExpanded((v) => !v)}
            aria-expanded={completedExpanded}
          >
            {completedExpanded ? (
              <ChevronDown size={12} aria-hidden="true" />
            ) : (
              <ChevronRight size={12} aria-hidden="true" />
            )}
            Completed ({completedTasks.count})
          </button>
          {completedExpanded && (
            <div className="mt-1 flex flex-col gap-2 px-1">{completedTasks.children}</div>
          )}
        </div>
      )}
    </section>
  );
}
