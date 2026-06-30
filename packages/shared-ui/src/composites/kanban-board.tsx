// biome-ignore-all lint/a11y/noAutofocus: autoFocus is intentional UX on the inline compose input.
import { X } from 'lucide-react';
import {
  type HTMLAttributes,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { DisabledActionTooltip } from './disabled-action-tooltip';

export interface KanbanBoardProps {
  children: ReactNode;
  /** Called with the typed bucket name; the trigger is omitted when undefined (no-permission view). */
  onAddBucket?: (name: string) => void | Promise<void>;
  /**
   * When set, the "Add another bucket" trigger renders disabled with this reason as a tooltip
   * instead of being interactive — for users who lack permission to create buckets.
   */
  addBucketDisabledReason?: string;
  /** When set, blocks submit and shows an inline error if the trimmed name exceeds this length. */
  nameMaxLength?: number;
  bucketCount?: number;
  /** Root Droppable slot for horizontal column reorder; wired by the app layer's @hello-pangea/dnd. */
  rootDroppable?: {
    ref?: (el: HTMLElement | null) => void;
    rootProps?: HTMLAttributes<HTMLElement>;
    placeholder?: ReactNode;
  };
}

export function KanbanBoard({
  children,
  onAddBucket,
  addBucketDisabledReason,
  nameMaxLength,
  bucketCount,
  rootDroppable,
}: KanbanBoardProps) {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const rootDroppableRef = useRef(rootDroppable);
  rootDroppableRef.current = rootDroppable;
  const setBoardRef = useCallback((el: HTMLDivElement | null) => {
    boardRef.current = el;
    rootDroppableRef.current?.ref?.(el);
  }, []);

  const wantScrollRef = useRef(false);
  const prevCountRef = useRef(bucketCount ?? 0);
  useEffect(() => {
    const prev = prevCountRef.current;
    const next = bucketCount ?? 0;
    prevCountRef.current = next;
    if (wantScrollRef.current && next > prev) {
      wantScrollRef.current = false;
      const el = boardRef.current;
      if (el) el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
    }
  }, [bucketCount]);

  const handleAddBucket = onAddBucket
    ? async (name: string) => {
        await onAddBucket(name);
        wantScrollRef.current = true;
      }
    : undefined;

  return (
    <div ref={setBoardRef} {...rootDroppable?.rootProps} className="kanban-board">
      {children}
      {rootDroppable?.placeholder}
      {handleAddBucket && (
        <AddBucket
          onSubmit={handleAddBucket}
          nameMaxLength={nameMaxLength}
          disabledReason={addBucketDisabledReason}
        />
      )}
    </div>
  );
}

function AddBucket({
  onSubmit,
  nameMaxLength,
  disabledReason,
}: {
  onSubmit: (name: string) => void | Promise<void>;
  nameMaxLength?: number;
  disabledReason?: string;
}) {
  const [composing, setComposing] = useState(false);
  const [value, setValue] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const composeRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!composing) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null;
      if (target && composeRef.current && !composeRef.current.contains(target)) {
        setComposing(false);
        setValue('');
        setNameError(null);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [composing]);

  async function submit() {
    const v = value.trim();
    if (!v) return;
    if (nameMaxLength !== undefined && v.length > nameMaxLength) {
      setNameError(`Bucket name cannot exceed ${nameMaxLength} characters.`);
      return;
    }
    setNameError(null);
    setIsSubmitting(true);
    try {
      await onSubmit(v);
      // Trello-style loop: keep the input open for the next bucket.
      setValue('');
      inputRef.current?.focus();
    } catch (err) {
      setNameError(err instanceof Error ? err.message : "Couldn't create the bucket.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function cancel() {
    setComposing(false);
    setValue('');
    setNameError(null);
  }

  if (!composing) {
    return (
      <DisabledActionTooltip disabled={Boolean(disabledReason)} reason={disabledReason}>
        <button
          type="button"
          className="kanban-board__add-bucket"
          onClick={() => setComposing(true)}
          disabled={Boolean(disabledReason)}
        >
          + Add another bucket
        </button>
      </DisabledActionTooltip>
    );
  }

  return (
    <div ref={composeRef} className="kanban-board__add-bucket-compose">
      <input
        ref={inputRef}
        autoFocus
        placeholder="Enter bucket name…"
        value={value}
        aria-invalid={!!nameError}
        onChange={(e) => {
          setValue(e.target.value);
          if (nameError) setNameError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void submit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
        aria-label="New bucket name"
      />
      {nameError ? (
        <p role="alert" className="kanban-board__add-bucket-compose-error">
          {nameError}
        </p>
      ) : null}
      <div className="kanban-board__add-bucket-compose-footer">
        <button
          type="button"
          className="kanban-board__add-bucket-compose-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void submit()}
          disabled={!value.trim() || isSubmitting}
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
