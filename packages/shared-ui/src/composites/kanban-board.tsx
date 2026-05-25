// biome-ignore-all lint/a11y/noAutofocus: autoFocus is intentional UX on the inline compose input.
import { X } from 'lucide-react';
import { type HTMLAttributes, type ReactNode, useEffect, useRef, useState } from 'react';

export interface KanbanBoardProps {
  children: ReactNode;
  /** Called with the typed bucket name; the trigger is omitted when undefined (no-permission view). */
  onAddBucket?: (name: string) => void;
  /** Root Droppable slot for horizontal column reorder; wired by the app layer's @hello-pangea/dnd. */
  rootDroppable?: {
    ref?: (el: HTMLElement | null) => void;
    rootProps?: HTMLAttributes<HTMLElement>;
    placeholder?: ReactNode;
  };
}

export function KanbanBoard({ children, onAddBucket, rootDroppable }: KanbanBoardProps) {
  return (
    <div ref={rootDroppable?.ref} {...rootDroppable?.rootProps} className="kanban-board">
      {children}
      {rootDroppable?.placeholder}
      {onAddBucket && <AddBucket onSubmit={onAddBucket} />}
    </div>
  );
}

function AddBucket({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [composing, setComposing] = useState(false);
  const [value, setValue] = useState('');
  const composeRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!composing) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null;
      if (target && composeRef.current && !composeRef.current.contains(target)) {
        setComposing(false);
        setValue('');
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [composing]);

  function submit() {
    const v = value.trim();
    if (!v) return;
    onSubmit(v);
    // Trello-style loop: keep the input open for the next bucket.
    setValue('');
    inputRef.current?.focus();
  }

  function cancel() {
    setComposing(false);
    setValue('');
  }

  if (!composing) {
    return (
      <button type="button" className="kanban-board__add-bucket" onClick={() => setComposing(true)}>
        + Add another bucket
      </button>
    );
  }

  return (
    <div ref={composeRef} className="kanban-board__add-bucket-compose">
      <input
        ref={inputRef}
        autoFocus
        placeholder="Enter bucket name…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
        aria-label="New bucket name"
      />
      <div className="kanban-board__add-bucket-compose-footer">
        <button
          type="button"
          className="kanban-board__add-bucket-compose-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={submit}
          disabled={!value.trim()}
        >
          Add bucket
        </button>
        <button
          type="button"
          className="kanban-board__add-bucket-compose-cancel"
          aria-label="Cancel adding bucket"
          onMouseDown={(e) => e.preventDefault()}
          onClick={cancel}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
