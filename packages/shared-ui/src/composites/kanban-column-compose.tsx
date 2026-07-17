// biome-ignore-all lint/a11y/noAutofocus: focus is moved programmatically after the user opens the compose form.
import { Button } from '@astryxdesign/core/Button';
import type { ISODateString } from '@astryxdesign/core/Calendar';
import { DateInput } from '@astryxdesign/core/DateInput';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import * as stylex from '@stylexjs/stylex';
import { useEffect, useRef, useState } from 'react';
import { PRIORITY_LEVELS } from '../lib/priority';
import { DropdownMenu, DropdownMenuItem } from '../primitives/dropdown-menu';

export interface QuickCreateTaskInput {
  title: string;
  due_at?: string;
  priority_number?: 1 | 3 | 5 | 9;
}

// Derived from the shared priority registry so dots use the same colors as
// PriorityIcon and the task detail panel — never redeclare priority colors here.
const PRIORITY_OPTIONS = PRIORITY_LEVELS.map((p) => ({
  value: p.value,
  label: p.label,
  color: p.color,
}));

const DEFAULT_PRIORITY: 1 | 3 | 5 | 9 = 5;

const styles = stylex.create({
  compose: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--spacing-2)',
    background: 'var(--color-background-body)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--spacing-2)',
    boxShadow: '0 0 0 1px var(--color-accent), 0 0 0 4px var(--color-accent-muted)',
  },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 4 },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--spacing-2)',
    paddingTop: 'var(--spacing-1)',
  },
  actions: { display: 'flex', gap: 4 },
  error: { color: 'var(--color-error)', margin: 0 },
  priorityDot: { display: 'inline-block', width: 8, height: 8, borderRadius: 2 },
});

export function KanbanColumnCompose({
  titleMaxLength,
  onSubmit,
  onCancel,
}: {
  titleMaxLength?: number;
  onSubmit: (input: QuickCreateTaskInput) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');
  const [dueAt, setDueAt] = useState<ISODateString | null>(null);
  const [priority, setPriority] = useState<1 | 3 | 5 | 9>(DEFAULT_PRIORITY);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Astryx TextInput has no autoFocus prop; focus imperatively on mount.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function submit() {
    const v = value.trim();
    if (!v) {
      onCancel();
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
      await onSubmit(payload);
    } catch (err) {
      setTitleError(err instanceof Error ? err.message : "Couldn't create the task.");
      return;
    } finally {
      setIsSubmitting(false);
    }
  }

  const priorityOpt = PRIORITY_OPTIONS.find((o) => o.value === priority) ?? PRIORITY_OPTIONS[2];

  return (
    <div {...stylex.props(styles.compose)}>
      <TextInput
        ref={inputRef}
        label="Task title"
        isLabelHidden
        placeholder="Task title"
        value={value}
        status={titleError ? { type: 'error' } : undefined}
        onChange={(v) => {
          setValue(v);
          if (titleError) setTitleError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !isSubmitting) void submit();
          if (e.key === 'Escape') onCancel();
        }}
      />
      {titleError ? (
        <Text as="p" role="alert" size="sm" weight="medium" xstyle={styles.error}>
          {titleError}
        </Text>
      ) : null}
      <div {...stylex.props(styles.chips)}>
        <DropdownMenu
          placement="below"
          hasChevron={false}
          button={{
            label: 'Priority',
            variant: 'secondary',
            size: 'sm',
            onMouseDown: (e) => e.preventDefault(),
            children: (
              <>
                <span
                  aria-hidden
                  {...stylex.props(styles.priorityDot)}
                  style={priorityOpt ? { backgroundColor: priorityOpt.color } : undefined}
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
                  aria-hidden
                  {...stylex.props(styles.priorityDot)}
                  style={{ backgroundColor: opt.color }}
                />
              }
              label={opt.label}
              onClick={() => setPriority(opt.value)}
            />
          ))}
        </DropdownMenu>

        <DateInput
          label="Due"
          isLabelHidden
          size="sm"
          value={dueAt ?? undefined}
          onChange={(v) => setDueAt(v ?? null)}
        />
      </div>
      <div {...stylex.props(styles.footer)}>
        <Text size="2xs" color="secondary">
          add
        </Text>
        <div {...stylex.props(styles.actions)}>
          <Button
            label="Cancel"
            variant="ghost"
            size="sm"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onCancel}
          />
          <Button
            label="Add"
            variant="primary"
            size="sm"
            isDisabled={!value.trim() || isSubmitting}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void submit()}
          />
        </div>
      </div>
    </div>
  );
}
