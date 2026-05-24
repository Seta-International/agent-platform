import { GripVertical, MoreHorizontal, Plus } from 'lucide-react';
import {
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { DatePill } from '../task/date-pill';
import { type PreviewType, PreviewTypeRadio } from '../task/preview-type-radio';
import { PrioritySegmented } from '../task/priority-segmented';
import { KbdHint } from './kbd-hint';

export interface QuickCreateTaskInput {
  title: string;
  start_at?: string;
  priority_number?: 1 | 3 | 5 | 9;
  preview_type?: PreviewType;
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

const DEFAULT_PRIORITY: 1 | 3 | 5 | 9 = 5;
const DEFAULT_PREVIEW_TYPE: PreviewType = 'automatic';

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
  const [moreOpen, setMoreOpen] = useState(false);
  const [startAt, setStartAt] = useState<string | null>(null);
  const [priority, setPriority] = useState<1 | 3 | 5 | 9>(DEFAULT_PRIORITY);
  const [previewType, setPreviewType] = useState<PreviewType>(DEFAULT_PREVIEW_TYPE);
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
    setMoreOpen(false);
    setStartAt(null);
    setPriority(DEFAULT_PRIORITY);
    setPreviewType(DEFAULT_PREVIEW_TYPE);
    setComposing(false);
  }

  function submit() {
    const v = value.trim();
    if (!v || !onCreateTask) {
      resetCompose();
      return;
    }
    const payload: QuickCreateTaskInput = { title: v };
    if (startAt) payload.start_at = startAt;
    if (priority !== DEFAULT_PRIORITY) payload.priority_number = priority;
    if (previewType !== DEFAULT_PREVIEW_TYPE) payload.preview_type = previewType;
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
                // biome-ignore lint/a11y/noAutofocus: intentional UX — inline rename needs immediate focus
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
            placeholder="Add a task…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') resetCompose();
            }}
            onBlur={() => {
              if (!value.trim() && !moreOpen) setComposing(false);
            }}
          />
          <button
            type="button"
            className="kanban-column__more-options-toggle"
            aria-expanded={moreOpen}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setMoreOpen((v) => !v)}
          >
            More options
          </button>
          {moreOpen && (
            <div className="kanban-column__more-options">
              <div className="kanban-column__more-options-row">
                <DatePill kind="Start" value={startAt} onChange={setStartAt} clearable />
              </div>
              <div className="kanban-column__more-options-row">
                <PrioritySegmented value={priority} onChange={setPriority} />
              </div>
              <div className="kanban-column__more-options-row">
                <PreviewTypeRadio value={previewType} onChange={setPreviewType} />
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
