import { Button } from '@astryxdesign/core/Button';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import * as stylex from '@stylexjs/stylex';
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

const styles = stylex.create({
  board: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 14,
    padding: 'var(--spacing-4) var(--spacing-6)',
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    background: 'var(--color-background-card)',
    scrollbarWidth: 'thin',
    scrollbarColor: 'var(--color-text-disabled) transparent',
  },
  addTrigger: { flexShrink: 0 },
  compose: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--spacing-2)',
    flexShrink: 0,
    width: 280,
    background: 'var(--color-background-body)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--spacing-2)',
    boxShadow: '0 0 0 1px var(--color-accent), 0 0 0 4px var(--color-accent-muted)',
  },
  composeFooter: { display: 'flex', alignItems: 'center', gap: 4 },
  error: { color: 'var(--color-error)', margin: 0 },
});

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
    <div ref={setBoardRef} {...rootDroppable?.rootProps} {...stylex.props(styles.board)}>
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

  // Astryx TextInput has no autoFocus prop; focus imperatively when compose opens.
  useEffect(() => {
    if (composing) inputRef.current?.focus();
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
        <Button
          label="+ Add another bucket"
          variant="ghost"
          isDisabled={Boolean(disabledReason)}
          onClick={() => setComposing(true)}
          xstyle={styles.addTrigger}
        />
      </DisabledActionTooltip>
    );
  }

  return (
    <div ref={composeRef} {...stylex.props(styles.compose)}>
      <TextInput
        ref={inputRef}
        label="New bucket name"
        isLabelHidden
        placeholder="Enter bucket name…"
        value={value}
        status={nameError ? { type: 'error' } : undefined}
        onChange={(v) => {
          setValue(v);
          if (nameError) setNameError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (!isSubmitting) void submit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
      />
      {nameError ? (
        <Text as="p" role="alert" size="sm" weight="medium" xstyle={styles.error}>
          {nameError}
        </Text>
      ) : null}
      <div {...stylex.props(styles.composeFooter)}>
        <Button
          label="Add bucket"
          variant="primary"
          size="sm"
          isDisabled={!value.trim() || isSubmitting}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void submit()}
        />
        <Button
          label="Cancel adding bucket"
          variant="ghost"
          size="sm"
          isIconOnly
          icon={<X size={16} aria-hidden />}
          onMouseDown={(e) => e.preventDefault()}
          onClick={cancel}
        />
      </div>
    </div>
  );
}
