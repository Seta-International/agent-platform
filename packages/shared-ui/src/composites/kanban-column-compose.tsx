// biome-ignore-all lint/a11y/noAutofocus: focus is moved programmatically after the user opens the compose form.
import { Button } from '@astryxdesign/core/Button';
import type { DateRange } from '@astryxdesign/core/Calendar';
import { Card } from '@astryxdesign/core/Card';
import { DateRangeInput } from '@astryxdesign/core/DateRangeInput';
import { MultiSelector } from '@astryxdesign/core/MultiSelector';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import * as stylex from '@stylexjs/stylex';
import { useEffect, useRef, useState } from 'react';
import { PRIORITY_LEVELS } from '../lib/priority';

export interface QuickCreateTaskInput {
  title: string;
  description?: string;
  start_at?: string;
  due_at?: string;
  priority_number?: 1 | 3 | 5 | 9;
  assignee_ids?: string[];
}

/** Assignable people for the quick-create form (e.g. plan/group members). */
export interface AssigneeOption {
  value: string;
  label?: string;
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
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 'var(--spacing-2)',
    paddingTop: 'var(--spacing-1)',
  },
  actions: { display: 'flex', gap: 4 },
  error: { color: 'var(--color-error)', margin: 0 },
  priorityDot: { display: 'inline-block', width: 8, height: 8, borderRadius: 2 },
  // Priority + date range sit side by side when there's room and wrap to two
  // lines once the column gets too narrow for both at their min widths.
  row: { display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-2)' },
  cellPriority: { flexGrow: 1, flexShrink: 1, flexBasis: 100, minWidth: 92 },
  cell: { flexGrow: 2, flexShrink: 1, flexBasis: 160, minWidth: 148 },
});

export function KanbanColumnCompose({
  titleMaxLength,
  assigneeOptions,
  onSubmit,
  onCancel,
}: {
  titleMaxLength?: number;
  /** When provided (non-empty), an assignee tokenizer is shown. */
  assigneeOptions?: ReadonlyArray<AssigneeOption>;
  onSubmit: (input: QuickCreateTaskInput) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');
  const [description, setDescription] = useState('');
  const [range, setRange] = useState<DateRange | null>(null);
  const [priority, setPriority] = useState<1 | 3 | 5 | 9>(DEFAULT_PRIORITY);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
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
    const desc = description.trim();
    if (desc) payload.description = desc;
    if (range?.start) payload.start_at = range.start;
    if (range?.end) payload.due_at = range.end;
    if (priority !== DEFAULT_PRIORITY) payload.priority_number = priority;
    if (assigneeIds.length) payload.assignee_ids = assigneeIds;

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

  const priorityOptions = PRIORITY_OPTIONS.map((o) => ({
    value: String(o.value),
    label: o.label,
    icon: (
      <span
        aria-hidden
        {...stylex.props(styles.priorityDot)}
        style={{ backgroundColor: o.color }}
      />
    ),
  }));

  return (
    <Card padding={2} xstyle={styles.compose}>
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
      <TextArea
        label="Description"
        isLabelHidden
        placeholder="Add a description (optional)"
        rows={2}
        value={description}
        onChange={(v) => setDescription(v)}
      />
      <div {...stylex.props(styles.row)}>
        <div {...stylex.props(styles.cellPriority)}>
          <Selector
            label="Priority"
            isLabelHidden
            size="sm"
            width="100%"
            value={String(priority)}
            onChange={(v) => setPriority(Number(v) as 1 | 3 | 5 | 9)}
            options={priorityOptions}
          />
        </div>
        <div {...stylex.props(styles.cell)}>
          <DateRangeInput
            label="Start and due dates"
            isLabelHidden
            size="sm"
            width="100%"
            placeholder="Dates"
            value={range}
            onChange={setRange}
          />
        </div>
      </div>
      {assigneeOptions && assigneeOptions.length > 0 && (
        <MultiSelector
          label="Assignees"
          isLabelHidden
          size="sm"
          width="100%"
          placeholder="Assign to…"
          options={assigneeOptions as AssigneeOption[]}
          value={assigneeIds}
          onChange={setAssigneeIds}
        />
      )}
      <div {...stylex.props(styles.footer)}>
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
    </Card>
  );
}
