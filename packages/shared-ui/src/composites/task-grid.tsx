// biome-ignore-all lint/a11y/useSemanticElements: CSS grid layout precludes <table>/<tr>/<th>; aria roles preserved for screen-reader semantics.
// biome-ignore-all lint/a11y/useFocusableInteractive: rows are non-interactive containers; focus lives on inline-edit controls inside each cell.
// biome-ignore-all lint/a11y/useAriaPropsSupportedByRole: aria-label on header div is overridden by the implicit row container; kept for axe + RTL queries.
// biome-ignore-all lint/a11y/noAutofocus: autoFocus is essential UX on inline edit inputs; user invoked the editor and expects keyboard focus.
import { ChevronDown, Pencil } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../primitives/dropdown-menu';
import { AvatarStack } from './avatar-stack';
import { LabelChip } from './label-chip';
import { PriorityIcon } from './priority-icon';
import { SyncBadge, type SyncState } from './sync-badge';

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
  external_source?: 'native' | 'm365';
  sync_status?: SyncState | null;
  external_synced_at?: string | null;
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
  onCommitField?: (taskId: string, patch: Partial<TaskGridRow>) => void;
  bucketOptions?: ReadonlyArray<BucketOption>;
  /** Opens the modal/detail view for the task. Triggered by the title click. */
  onOpenTask?: (taskId: string) => void;
  columnOrder?: string[];
  columnWidths?: Record<string, number>;
  onColumnOrderChange?: (next: string[]) => void;
  onColumnWidthsChange?: (next: Record<string, number>) => void;
  /** bucket_id being added to; null = no bucket; undefined = not adding */
  addingBucketId?: string | null;
  onAddTask?: (title: string, bucketId: string | null) => void;
  onCancelAdd?: () => void;
}

const STATUS_OPTIONS: Array<{
  value: TaskGridRow['status'];
  label: string;
  dotClass: string;
}> = [
  { value: 'not_started', label: 'Not started', dotClass: 'status-dot--muted' },
  { value: 'in_progress', label: 'In progress', dotClass: 'status-dot--primary' },
  { value: 'completed', label: 'Completed', dotClass: 'status-dot--success' },
  { value: 'deferred', label: 'Deferred', dotClass: 'status-dot--warning' },
];

const PRIORITY_OPTIONS: Array<{ value: TaskGridRow['priority']; label: string }> = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'important', label: 'Important' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

// Shared grid template so header and rows align perfectly.
const GRID_TEMPLATE_COLS =
  '[grid-template-columns:36px_minmax(220px,2.4fr)_140px_130px_130px_130px_110px_minmax(120px,1fr)]';

function bucketStatusForName(name: string): 'muted' | 'primary' | 'warning' | 'success' {
  const n = name.toLowerCase();
  if (n.includes('progress')) return 'primary';
  if (n.includes('review')) return 'warning';
  if (n.includes('done') || n.includes('complete')) return 'success';
  return 'muted';
}

function isOverdue(due: string | null): boolean {
  if (!due) return false;
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return d < today;
}

function formatDue(due: string | null): string {
  if (!due) return '';
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatGroupHeader(
  by: GroupBy,
  key: string,
): { label: string; status: 'muted' | 'primary' | 'warning' | 'success' } {
  if (by === 'bucket') return { label: key, status: bucketStatusForName(key) };
  if (by === 'priority') {
    const opt = PRIORITY_OPTIONS.find((o) => o.value === key);
    return { label: opt?.label ?? key, status: 'muted' };
  }
  return { label: key, status: 'muted' };
}

export function TaskGrid({
  rows,
  groupBy,
  selection,
  onSelectionChange,
  onCommitField,
  bucketOptions,
  onOpenTask,
  addingBucketId,
  onAddTask,
  onCancelAdd,
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

  const headCellCls = 'text-[11px] font-medium uppercase tracking-[0.04em] text-ink-subtle min-w-0';

  return (
    <div className={`flex flex-1 flex-col overflow-auto bg-surface-1 px-lg py-md`}>
      <div
        aria-label="Grid columns"
        className={`grid ${GRID_TEMPLATE_COLS} mb-2 min-h-11 items-center gap-2 border-b border-hairline px-3`}
      >
        <div className={`${headCellCls} flex items-center justify-center`}>
          <span className="sr-only">Select</span>
        </div>
        <div className={headCellCls}>Title</div>
        <div className={headCellCls}>Status</div>
        <div className={headCellCls}>Bucket</div>
        <div className={headCellCls}>Priority</div>
        <div className={headCellCls}>Assignees</div>
        <div className={headCellCls}>Due</div>
        <div className={`${headCellCls} pr-2`}>Labels</div>
      </div>

      {[...groups.entries()].map(([groupKey, groupRowList]) => {
        const header = formatGroupHeader(groupBy, groupKey);
        const groupBucketId = groupRowList[0]?.bucket_id ?? null;
        return (
          <Fragment key={groupKey}>
            <div className="mt-2 flex items-center gap-2 px-3 pb-2 pt-3 first:mt-0">
              <span className={`status-dot status-dot--${header.status}`} aria-hidden />
              <span className="text-body-sm font-semibold text-ink">{header.label}</span>
              <span className="text-caption text-ink-subtle">{groupRowList.length}</span>
            </div>

            {groupRowList.map((r) => {
              const overdue = isOverdue(r.due);
              const isSelected = selection.has(r.id);
              const isEditingTitle = editing?.taskId === r.id && editing.field === 'title';

              return (
                <div
                  key={r.id}
                  role="row"
                  aria-label={r.title}
                  aria-selected={isSelected}
                  className={[
                    'group grid items-center gap-2 px-3',
                    GRID_TEMPLATE_COLS,
                    'min-h-11 mb-1 rounded-md border bg-canvas transition-colors',
                    isSelected
                      ? 'border-primary shadow-[0_0_0_1px_var(--color-primary)]'
                      : 'border-hairline hover:border-hairline-strong hover:shadow-sm',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-center">
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.title}`}
                      checked={isSelected}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelect(r.id, e.shiftKey);
                      }}
                      onChange={() => {}}
                    />
                  </div>

                  <div className="flex min-w-0 items-center gap-1.5">
                    {isEditingTitle ? (
                      <TitleInput
                        initialValue={r.title}
                        onCommit={(value) => {
                          if (value !== r.title) onCommitField?.(r.id, { title: value });
                          setEditing(null);
                        }}
                        onCancel={() => setEditing(null)}
                      />
                    ) : (
                      <>
                        <button
                          type="button"
                          aria-label={`Open ${r.title}`}
                          className="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-left text-body-sm font-medium text-ink hover:text-primary hover:underline hover:underline-offset-2"
                          onClick={() => onOpenTask?.(r.id)}
                        >
                          {r.title}
                        </button>
                        <button
                          type="button"
                          aria-label={`Rename ${r.title}`}
                          className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-sm text-ink-subtle opacity-0 transition-opacity hover:bg-surface-2 hover:text-ink group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditing({ taskId: r.id, field: 'title' });
                          }}
                        >
                          <Pencil className="size-3" aria-hidden />
                        </button>
                        {r.external_source === 'm365' && (
                          <SyncBadge
                            state={r.sync_status ?? null}
                            synced_at={r.external_synced_at ?? null}
                            size="mini"
                          />
                        )}
                      </>
                    )}
                  </div>

                  <div className="flex min-w-0 items-center">
                    <StatusCell
                      label={`Edit status for ${r.title}`}
                      value={r.status}
                      onChange={(v) => onCommitField?.(r.id, { status: v })}
                    />
                  </div>

                  <div className="flex min-w-0 items-center">
                    {bucketOptions ? (
                      <BucketCell
                        label={`Edit bucket for ${r.title}`}
                        value={r.bucket_id ?? ''}
                        bucketName={r.bucket}
                        options={bucketOptions}
                        onChange={(v) =>
                          onCommitField?.(r.id, {
                            bucket_id: v === '' ? null : v,
                            bucket: bucketOptions.find((b) => b.id === v)?.name ?? 'No bucket',
                          })
                        }
                      />
                    ) : (
                      <BucketPill name={r.bucket} />
                    )}
                  </div>

                  <div className="flex min-w-0 items-center">
                    <PriorityCell
                      label={`Edit priority for ${r.title}`}
                      value={r.priority}
                      onChange={(v) => onCommitField?.(r.id, { priority: v })}
                    />
                  </div>

                  <div className="flex min-w-0 items-center">
                    <button
                      type="button"
                      aria-label={`Edit assignees for ${r.title}`}
                      onClick={() => onOpenTask?.(r.id)}
                      className="inline-flex min-w-0 items-center gap-1 rounded-sm border-0 bg-transparent p-0 hover:opacity-80"
                    >
                      {r.assignees.length === 0 ? (
                        <span className="text-caption text-ink-tertiary">—</span>
                      ) : (
                        <AvatarStack
                          assignees={r.assignees.map((a) => ({
                            user_id: a.id,
                            display_name: a.name,
                          }))}
                        />
                      )}
                    </button>
                  </div>

                  <div className="flex min-w-0 items-center">
                    <DueCell
                      value={r.due}
                      overdue={overdue}
                      onChange={(v) => onCommitField?.(r.id, { due: v })}
                      label={`Edit due date for ${r.title}`}
                    />
                  </div>

                  <div className="flex min-w-0 items-center gap-1 pr-2">
                    <button
                      type="button"
                      aria-label={`Edit labels for ${r.title}`}
                      onClick={() => onOpenTask?.(r.id)}
                      className="inline-flex min-w-0 items-center gap-1 rounded-sm border-0 bg-transparent p-0 hover:opacity-80"
                    >
                      {r.labels.length === 0 ? (
                        <span className="text-caption text-ink-tertiary">—</span>
                      ) : (
                        <>
                          <LabelChip name={r.labels[0]?.name ?? ''} />
                          {r.labels.length > 1 && (
                            <span className="text-caption text-ink-subtle">
                              +{r.labels.length - 1}
                            </span>
                          )}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}

            {groupBy === 'bucket' &&
              (addingBucketId === groupBucketId ? (
                <AddTaskRow
                  bucketId={groupBucketId}
                  onCommit={(title) => onAddTask?.(title, groupBucketId)}
                  onCancel={() => onCancelAdd?.()}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => onAddTask?.('__open__', groupBucketId)}
                  className="mb-1 flex w-full items-center gap-1.5 rounded-md px-3 py-2 text-body-sm text-ink-subtle hover:bg-surface-2 hover:text-ink"
                >
                  <span className="text-base leading-none">+</span> Add a task
                </button>
              ))}
          </Fragment>
        );
      })}

      {groupBy === 'bucket' && (
        <div className="mt-2">
          {addingBucketId === null ? (
            <AddTaskRow
              bucketId={null}
              onCommit={(title) => onAddTask?.(title, null)}
              onCancel={() => onCancelAdd?.()}
            />
          ) : (
            <button
              type="button"
              onClick={() => onAddTask?.('__open__', null)}
              className="flex w-full items-center gap-1.5 rounded-md px-3 py-2 text-body-sm text-ink-subtle hover:bg-surface-2 hover:text-ink"
            >
              <span className="text-base leading-none">+</span> Add a task
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const CHIP_CLS =
  'inline-flex max-w-full items-center gap-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-caption text-ink hover:bg-surface-1 hover:shadow-[inset_0_0_0_1px_var(--color-hairline)]';

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
      autoFocus
      className="w-full rounded-sm border border-primary bg-canvas px-1.5 py-1 text-body-sm text-ink outline-none"
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

interface StatusCellProps {
  label: string;
  value: TaskGridRow['status'];
  onChange: (next: TaskGridRow['status']) => void;
}

function StatusCell({ label, value, onChange }: StatusCellProps) {
  const current = STATUS_OPTIONS.find((o) => o.value === value) ?? STATUS_OPTIONS[0];
  if (!current) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={CHIP_CLS} aria-label={label}>
          <span className={`status-dot ${current.dotClass}`} aria-hidden />
          <span className="truncate">{current.label}</span>
          <ChevronDown className="size-3 shrink-0 text-ink-subtle" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[180px]">
        {STATUS_OPTIONS.map((o) => (
          <DropdownMenuItem
            key={o.value}
            onSelect={() => o.value !== value && onChange(o.value)}
            className="flex items-center gap-2"
          >
            <span className={`status-dot ${o.dotClass}`} aria-hidden />
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface PriorityCellProps {
  label: string;
  value: TaskGridRow['priority'];
  onChange: (next: TaskGridRow['priority']) => void;
}

function PriorityCell({ label, value, onChange }: PriorityCellProps) {
  const current = PRIORITY_OPTIONS.find((o) => o.value === value) ?? PRIORITY_OPTIONS[2];
  if (!current) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={CHIP_CLS} aria-label={label}>
          <PriorityIcon level={value} />
          <span className="truncate">{current.label}</span>
          <ChevronDown className="size-3 shrink-0 text-ink-subtle" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[180px]">
        {PRIORITY_OPTIONS.map((o) => (
          <DropdownMenuItem
            key={o.value}
            onSelect={() => o.value !== value && onChange(o.value)}
            className="flex items-center gap-2"
          >
            <PriorityIcon level={o.value} />
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface BucketCellProps {
  label: string;
  value: string;
  bucketName: string;
  options: ReadonlyArray<BucketOption>;
  onChange: (next: string) => void;
}

function BucketCell({ label, value, bucketName, options, onChange }: BucketCellProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="border-0 bg-transparent p-0" aria-label={label}>
          <BucketPill name={bucketName} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[200px]">
        <DropdownMenuItem
          onSelect={() => value !== '' && onChange('')}
          className="flex items-center gap-2"
        >
          <span className="status-dot status-dot--muted" aria-hidden />
          No bucket
        </DropdownMenuItem>
        {options.map((o) => (
          <DropdownMenuItem
            key={o.id}
            onSelect={() => o.id !== value && onChange(o.id)}
            className="flex items-center gap-2"
          >
            <span className={`status-dot status-dot--${bucketStatusForName(o.name)}`} aria-hidden />
            {o.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BucketPill({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-caption text-ink">
      <span className={`status-dot status-dot--${bucketStatusForName(name)}`} aria-hidden />
      <span className="truncate">{name}</span>
    </span>
  );
}

interface DueCellProps {
  value: string | null;
  overdue: boolean;
  onChange: (next: string | null) => void;
  label: string;
}

function DueCell({ value, overdue, onChange, label }: DueCellProps) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <input
        type="date"
        defaultValue={value ? value.slice(0, 10) : ''}
        aria-label={label}
        autoFocus
        className="rounded-sm border border-primary bg-canvas px-1.5 py-1 text-caption text-ink outline-none"
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
      className={`${CHIP_CLS} ${overdue ? '!bg-semantic-danger-tint !text-semantic-danger' : ''}`}
      aria-label={label}
      onClick={() => setEditing(true)}
    >
      {value ? formatDue(value) : <span className="text-ink-tertiary">— set due</span>}
    </button>
  );
}

interface AddTaskRowProps {
  bucketId: string | null;
  onCommit: (title: string) => void;
  onCancel: () => void;
}

function AddTaskRow({ onCommit, onCancel }: AddTaskRowProps) {
  const committedRef = useRef(false);
  useEffect(() => {
    committedRef.current = false;
  }, []);

  return (
    <div
      className={[
        'grid items-center gap-2 px-3',
        GRID_TEMPLATE_COLS,
        'min-h-11 mb-1 rounded-md border border-primary bg-canvas shadow-[0_0_0_1px_var(--color-primary)]',
      ].join(' ')}
    >
      <div />
      <input
        type="text"
        placeholder="Task name"
        aria-label="New task title"
        autoFocus
        className="col-span-7 w-full rounded-sm border-0 bg-transparent px-1.5 py-1 text-body-sm text-ink outline-none placeholder:text-ink-tertiary"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const value = (e.target as HTMLInputElement).value.trim();
            if (value) {
              committedRef.current = true;
              onCommit(value);
            }
          }
          if (e.key === 'Escape') {
            committedRef.current = true;
            onCancel();
          }
        }}
        onBlur={(e) => {
          if (!committedRef.current) {
            const value = e.target.value.trim();
            if (value) onCommit(value);
            else onCancel();
          }
        }}
      />
    </div>
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
