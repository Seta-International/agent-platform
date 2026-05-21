import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '../primitives/popover';

export interface TaskGridRow {
  id: string;
  title: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'deferred';
  bucket: string;
  bucket_id: string | null;
  priority: 'urgent' | 'important' | 'medium' | 'low';
  assignees: Array<{ id: string; name: string }>;
  due: string | null;
  labels: Array<{ id: string; name: string }>;
}

export type GroupBy = 'bucket' | 'assignee' | 'priority' | 'due' | 'label';

export interface BucketOption {
  id: string;
  name: string;
}

export interface TaskGridProps {
  rows: TaskGridRow[];
  groupBy: GroupBy;
  selection: Set<string>;
  onSelectionChange: (next: Set<string>) => void;
  /** Patch shape mirrors TaskGridRow keys the caller wants to update. */
  onCommitField?: (taskId: string, patch: Partial<TaskGridRow>) => void;
  /** Buckets available when editing the bucket cell. If omitted, the cell is read-only. */
  bucketOptions?: ReadonlyArray<BucketOption>;
  /** Open the task page for cells that cannot be edited inline (assignees, labels). */
  onOpenTask?: (taskId: string) => void;
  columnOrder?: string[];
  columnWidths?: Record<string, number>;
  onColumnOrderChange?: (next: string[]) => void;
  onColumnWidthsChange?: (next: Record<string, number>) => void;
}

const STATUS_OPTIONS: Array<{ value: TaskGridRow['status']; label: string }> = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'deferred', label: 'Deferred' },
];

const PRIORITY_OPTIONS: Array<{ value: TaskGridRow['priority']; label: string }> = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'important', label: 'Important' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

export function TaskGrid({
  rows,
  groupBy,
  selection,
  onSelectionChange,
  onCommitField,
  bucketOptions,
  onOpenTask,
}: TaskGridProps) {
  const groups = useMemo(() => groupRows(rows, groupBy), [rows, groupBy]);
  const [editing, setEditing] = useState<{ taskId: string; field: keyof TaskGridRow } | null>(null);
  const lastClickedRef = useRef<string | null>(null);

  function toggleSelect(rowId: string, shift: boolean) {
    const next = new Set(selection);
    if (shift && lastClickedRef.current) {
      const ordered = rows.map((r) => r.id);
      const start = ordered.indexOf(lastClickedRef.current);
      const end = ordered.indexOf(rowId);
      const [lo, hi] = start < end ? [start, end] : [end, start];
      for (let i = lo; i <= hi; i++) {
        const id = ordered[i];
        if (id !== undefined) next.add(id);
      }
    } else {
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      lastClickedRef.current = rowId;
    }
    onSelectionChange(next);
  }

  return (
    <table className="task-grid">
      <thead>
        <tr aria-label="Grid columns">
          <th scope="col">
            <span className="sr-only">Select</span>
          </th>
          <th scope="col">Title</th>
          <th scope="col">Status</th>
          <th scope="col">Bucket</th>
          <th scope="col">Priority</th>
          <th scope="col">Assignees</th>
          <th scope="col">Due</th>
          <th scope="col">Labels</th>
        </tr>
      </thead>
      <tbody>
        {[...groups.entries()].map(([groupName, groupRowList]) => (
          <Fragment key={groupName}>
            <tr className="task-grid__group-header">
              <td colSpan={8}>
                {groupName} <span className="task-grid__count">({groupRowList.length})</span>
              </td>
            </tr>
            {groupRowList.map((r) => (
              <tr key={r.id} aria-label={r.title}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.title}`}
                    checked={selection.has(r.id)}
                    onClick={(e) => toggleSelect(r.id, e.shiftKey)}
                    onChange={() => {}}
                  />
                </td>
                <td>
                  {editing?.taskId === r.id && editing.field === 'title' ? (
                    <TitleInput
                      initialValue={r.title}
                      onCommit={(value) => {
                        onCommitField?.(r.id, { title: value });
                        setEditing(null);
                      }}
                      onCancel={() => setEditing(null)}
                    />
                  ) : (
                    <button
                      type="button"
                      aria-label={`Edit title: ${r.title}`}
                      className="task-grid__title-trigger"
                      onClick={() => setEditing({ taskId: r.id, field: 'title' })}
                    >
                      {r.title}
                    </button>
                  )}
                </td>
                <td>
                  <SelectCell
                    label={`Edit status for ${r.title}`}
                    value={r.status}
                    options={STATUS_OPTIONS}
                    onChange={(v) => onCommitField?.(r.id, { status: v })}
                    formatValue={(v) => v.replaceAll('_', ' ')}
                  />
                </td>
                <td>
                  {bucketOptions ? (
                    <SelectCell
                      label={`Edit bucket for ${r.title}`}
                      value={r.bucket_id ?? ''}
                      options={[
                        { value: '', label: 'No bucket' },
                        ...bucketOptions.map((b) => ({ value: b.id, label: b.name })),
                      ]}
                      onChange={(v) =>
                        onCommitField?.(r.id, {
                          bucket_id: v === '' ? null : v,
                          bucket: bucketOptions.find((b) => b.id === v)?.name ?? 'No bucket',
                        })
                      }
                      formatValue={() => r.bucket}
                    />
                  ) : (
                    r.bucket
                  )}
                </td>
                <td>
                  <SelectCell
                    label={`Edit priority for ${r.title}`}
                    value={r.priority}
                    options={PRIORITY_OPTIONS}
                    onChange={(v) => onCommitField?.(r.id, { priority: v })}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="task-grid__cell-trigger"
                    aria-label={`Edit assignees for ${r.title}`}
                    onClick={() => onOpenTask?.(r.id)}
                  >
                    {r.assignees.length === 0 ? '—' : r.assignees.map((a) => a.name).join(', ')}
                  </button>
                </td>
                <td>
                  <DueCell
                    value={r.due}
                    onChange={(v) => onCommitField?.(r.id, { due: v })}
                    label={`Edit due date for ${r.title}`}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="task-grid__cell-trigger"
                    aria-label={`Edit labels for ${r.title}`}
                    onClick={() => onOpenTask?.(r.id)}
                  >
                    {r.labels.length === 0 ? '—' : r.labels.map((l) => l.name).join(', ')}
                  </button>
                </td>
              </tr>
            ))}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

interface TitleInputProps {
  initialValue: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}

function TitleInput({ initialValue, onCommit, onCancel }: TitleInputProps) {
  const committedRef = useRef(false);
  useEffect(() => {
    committedRef.current = false;
  }, []);

  return (
    <input
      type="text"
      defaultValue={initialValue}
      aria-label="Edit title"
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          committedRef.current = true;
          onCommit((e.target as HTMLInputElement).value);
        }
        if (e.key === 'Escape') {
          committedRef.current = true;
          onCancel();
        }
      }}
      onBlur={(e) => {
        if (!committedRef.current) onCommit(e.target.value);
      }}
    />
  );
}

interface SelectCellProps<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (next: T) => void;
  formatValue?: (value: T) => string;
}

function SelectCell<T extends string>({
  label,
  value,
  options,
  onChange,
  formatValue,
}: SelectCellProps<T>) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  const display = formatValue ? formatValue(value) : (current?.label ?? value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="task-grid__cell-trigger" aria-label={label}>
          {display}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-44 p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className="flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-surface-2"
            onClick={() => {
              if (o.value !== value) onChange(o.value);
              setOpen(false);
            }}
          >
            <span>{o.label}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

interface DueCellProps {
  value: string | null;
  onChange: (next: string | null) => void;
  label: string;
}

function DueCell({ value, onChange, label }: DueCellProps) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <input
        type="date"
        defaultValue={value ? value.slice(0, 10) : ''}
        aria-label={label}
        onBlur={(e) => {
          const v = e.target.value;
          onChange(v ? new Date(v).toISOString() : null);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }
  return (
    <button
      type="button"
      suppressHydrationWarning
      className="task-grid__cell-trigger"
      aria-label={label}
      onClick={() => setEditing(true)}
    >
      {value ? new Date(value).toLocaleDateString() : '—'}
    </button>
  );
}

function groupRows(rows: TaskGridRow[], by: GroupBy): Map<string, TaskGridRow[]> {
  const m = new Map<string, TaskGridRow[]>();
  for (const r of rows) {
    let k: string;
    switch (by) {
      case 'bucket':
        k = r.bucket;
        break;
      case 'assignee':
        k = r.assignees[0]?.name ?? 'Unassigned';
        break;
      case 'priority':
        k = r.priority;
        break;
      case 'due':
        k = r.due ? r.due.slice(0, 10) : 'No due date';
        break;
      case 'label':
        k = r.labels[0]?.name ?? 'No label';
        break;
    }
    const arr = m.get(k) ?? [];
    arr.push(r);
    m.set(k, arr);
  }
  return m;
}
