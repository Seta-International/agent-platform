import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import * as stylex from '@stylexjs/stylex';
import {
  Children,
  type HTMLAttributes,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { DisabledActionTooltip } from './disabled-action-tooltip';

const scrollNone = stylex.create({
  hide: { scrollbarWidth: 'none' },
});
const styles = stylex.create({
  board: {
    display: 'flex',
    alignItems: 'stretch',
    gap: 14,
    padding: 'var(--spacing-4) var(--spacing-6)',
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    background: 'var(--color-background-card)',
    scrollbarWidth: 'thin',
    scrollbarColor: 'var(--color-text-disabled) transparent',
  },
  addTrigger: { flexShrink: 0, alignSelf: 'flex-start' },
  compose: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--spacing-2)',
    flexShrink: 0,
    alignSelf: 'flex-start',
    width: 280,
  },
  composeFooter: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
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
  /**
   * Rendered instead of children + AddBucket when there are no columns. Pass a function to
   * get a `startCompose` callback that opens the add-bucket input in one click instead of
   * requiring the user to first reveal, then click, the "+ Add another bucket" trigger.
   */
  emptyState?: ReactNode | ((startCompose: () => void) => ReactNode);
  /** Exposes the board scroll element for a sync-scrollbar. */
  scrollRef?: (el: HTMLDivElement | null) => void;
  /** Hides the native scrollbar (for pages that provide a external sync-scrollbar). */
  hideNativeScrollbar?: boolean;
}

export function KanbanBoard(props: KanbanBoardProps) {
  const {
    children,
    onAddBucket,
    addBucketDisabledReason,
    nameMaxLength,
    bucketCount,
    rootDroppable,
    emptyState,
    scrollRef,
    hideNativeScrollbar,
  } = props;
  const [composing, setComposing] = useState(false);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const rootDroppableRef = useRef(rootDroppable);
  rootDroppableRef.current = rootDroppable;
  const setBoardRef = useCallback(
    (el: HTMLDivElement | null) => {
      boardRef.current = el;
      scrollRef?.(el);
      rootDroppableRef.current?.ref?.(el);
    },
    [scrollRef],
  );

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

  const isEmpty = Children.count(children) === 0;

  return (
    <div
      ref={setBoardRef}
      {...rootDroppable?.rootProps}
      {...stylex.props(styles.board, hideNativeScrollbar && scrollNone.hide)}
    >
      {isEmpty && emptyState && !composing ? (
        typeof emptyState === 'function' ? (
          emptyState(() => setComposing(true))
        ) : (
          emptyState
        )
      ) : (
        <>
          {children}
          {rootDroppable?.placeholder}
          {handleAddBucket && (
            <AddBucket
              composing={composing}
              onComposingChange={setComposing}
              onSubmit={handleAddBucket}
              nameMaxLength={nameMaxLength}
              disabledReason={addBucketDisabledReason}
            />
          )}
        </>
      )}
    </div>
  );
}

function AddBucket({
  composing,
  onComposingChange,
  onSubmit,
  nameMaxLength,
  disabledReason,
}: {
  composing: boolean;
  onComposingChange: (v: boolean) => void;
  onSubmit: (name: string) => void | Promise<void>;
  nameMaxLength?: number;
  disabledReason?: string;
}) {
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
        onComposingChange(false);
        setValue('');
        setNameError(null);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [composing, onComposingChange]);

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
    onComposingChange(false);
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
          onClick={() => onComposingChange(true)}
          xstyle={styles.addTrigger}
        />
      </DisabledActionTooltip>
    );
  }

  return (
    <Card ref={composeRef} padding={2} xstyle={styles.compose}>
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
          label="Cancel"
          variant="ghost"
          size="sm"
          onMouseDown={(e) => e.preventDefault()}
          onClick={cancel}
        />
        <Button
          label="Add bucket"
          variant="primary"
          size="sm"
          isDisabled={!value.trim() || isSubmitting}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void submit()}
        />
      </div>
    </Card>
  );
}
