// biome-ignore-all lint/a11y/noAutofocus: autoFocus is essential UX on inline edit inputs; user invoked the editor and expects keyboard focus.
import { Pencil } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DateInput } from '../primitives/date-input';
import { DropdownMenu, DropdownMenuItem } from '../primitives/dropdown-menu';
import type { TableColumn } from '../primitives/table';
import { pixel, proportional } from '../primitives/table';
import { AvatarStack } from './avatar-stack';
import { DisabledActionTooltip } from './disabled-action-tooltip';
import { GroupedGrid } from './grouped-grid';
import { LabelChip } from './label-chip';
import { PriorityIcon } from './priority-icon';
import { type DotTone, StatusToneDot } from './status-tone-dot';
import { SyncBadge, type SyncState } from './sync-badge';

export interface TaskGridRow extends Record<string, unknown> {
  id: string;
  title: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'deferred';
  bucket: string;
  bucket_id: string | null;
  priority: 'urgent' | 'important' | 'medium' | 'low';
  assignees: Array<{ id: string; name: string }>;
  start: string | null;
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
  /** Fired when a row is clicked outside its interactive cells (peek intent). */
  onRowClick?: (taskId: string) => void;
  /** Row highlighted as the current peek target. */
  activeRowId?: string | null;
  columnOrder?: string[];
  columnWidths?: Record<string, number>;
  onColumnOrderChange?: (next: string[]) => void;
  /** Partial map of resized column widths — merge into persisted prefs. */
  onColumnWidthsChange?: (updates: Record<string, number>) => void;
  /** bucket_id being added to; null = no bucket; undefined = not adding */
  addingBucketId?: string | null;
  onAddTask?: (title: string, bucketId: string | null) => void;
  onCancelAdd?: () => void;
  /**
   * When set, inline field editing (title rename, status/bucket/priority/due cells) is disabled
   * with this reason as a tooltip — for users who lack permission to update tasks.
   */
  editDisabledReason?: string;
  /** When set, the "Add a task" row is disabled with this reason — lacks permission to create tasks. */
  addTaskDisabledReason?: string;
}

const STATUS_OPTIONS: Array<{
  value: TaskGridRow['status'];
  label: string;
  tone: DotTone;
}> = [
  { value: 'not_started', label: 'Not started', tone: 'muted' },
  { value: 'in_progress', label: 'In progress', tone: 'primary' },
  { value: 'completed', label: 'Completed', tone: 'success' },
  { value: 'deferred', label: 'Deferred', tone: 'warning' },
];

const PRIORITY_OPTIONS: Array<{ value: TaskGridRow['priority']; label: string }> = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'important', label: 'Important' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

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

function groupKeyFor(r: TaskGridRow, by: GroupBy): string {
  switch (by) {
    case 'bucket':
      return r.bucket;
    case 'assignee':
      return r.assignees[0]?.name ?? 'Unassigned';
    case 'priority':
      return r.priority;
    case 'due':
      return r.due ? r.due.slice(0, 10) : 'No due date';
    case 'label':
      return r.labels[0]?.name ?? 'No label';
  }
}

export function TaskGrid({
  rows,
  groupBy,
  selection,
  onSelectionChange,
  onCommitField,
  bucketOptions,
  onOpenTask,
  onRowClick,
  activeRowId,
  columnOrder,
  columnWidths,
  onColumnOrderChange,
  onColumnWidthsChange,
  addingBucketId,
  onAddTask,
  onCancelAdd,
  editDisabledReason,
  addTaskDisabledReason,
}: TaskGridProps) {
  const editDisabled = Boolean(editDisabledReason);
  const [editing, setEditing] = useState<{ taskId: string; field: keyof TaskGridRow } | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const lastClickedRef = useRef<string | null>(null);

  const toggleSelect = useCallback(
    (rowId: string, shift: boolean) => {
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
    },
    [selection, rows, onSelectionChange],
  );

  const groupKeyOf = useCallback((r: TaskGridRow) => groupKeyFor(r, groupBy), [groupBy]);

  // When grouped by bucket, plan buckets define the group order AND force
  // empty buckets to render so they keep their "Add a task" affordance.
  const groupOrder = useMemo(
    () =>
      groupBy === 'bucket' && bucketOptions?.length ? bucketOptions.map((b) => b.name) : undefined,
    [groupBy, bucketOptions],
  );

  const bucketIdByGroup = useMemo(() => {
    const map = new Map<string, string | null>();
    if (groupBy !== 'bucket') return map;
    for (const b of bucketOptions ?? []) map.set(b.name, b.id);
    for (const r of rows) if (!map.has(r.bucket)) map.set(r.bucket, r.bucket_id);
    return map;
  }, [groupBy, bucketOptions, rows]);

  const columns = useMemo<TableColumn<TaskGridRow>[]>(
    () => [
      {
        key: 'select',
        header: <span className="sr-only">Select</span>,
        width: pixel(44),
        align: 'center',
        resizable: false,
        renderCell: (r) => (
          <input
            type="checkbox"
            aria-label={`Select ${r.title}`}
            checked={selection.has(r.id)}
            onClick={(e) => {
              e.stopPropagation();
              toggleSelect(r.id, e.shiftKey);
            }}
            onChange={() => {}}
          />
        ),
      },
      {
        key: 'title',
        header: 'Title',
        width: proportional(2.4, { minWidth: 220 }),
        renderCell: (r) => {
          if (editing?.taskId === r.id && editing.field === 'title') {
            return (
              <TitleInput
                initialValue={r.title}
                onCommit={(value) => {
                  if (value !== r.title) onCommitField?.(r.id, { title: value });
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
              />
            );
          }
          return (
            <div className="group flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                aria-label={`Open ${r.title}`}
                className="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-left text-base font-medium text-primary hover:text-accent hover:underline hover:underline-offset-2"
                onClick={() => onOpenTask?.(r.id)}
              >
                {r.title}
              </button>
              <DisabledActionTooltip disabled={editDisabled} reason={editDisabledReason}>
                <button
                  type="button"
                  aria-label={`Rename ${r.title}`}
                  className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-sm text-secondary opacity-0 transition-opacity hover:bg-surface hover:text-primary group-hover:opacity-100"
                  disabled={editDisabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing({ taskId: r.id, field: 'title' });
                  }}
                >
                  <Pencil className="size-3" aria-hidden />
                </button>
              </DisabledActionTooltip>
              {r.external_source === 'm365' && (
                <SyncBadge
                  state={r.sync_status ?? null}
                  synced_at={r.external_synced_at ?? null}
                  size="mini"
                />
              )}
            </div>
          );
        },
      },
      {
        key: 'status',
        header: 'Status',
        width: pixel(140),
        renderCell: (r) => (
          <StatusCell
            label={`Edit status for ${r.title}`}
            value={r.status}
            disabled={editDisabled}
            onChange={(v) => onCommitField?.(r.id, { status: v })}
          />
        ),
      },
      {
        key: 'bucket',
        header: 'Bucket',
        width: pixel(130),
        renderCell: (r) =>
          bucketOptions ? (
            <BucketCell
              label={`Edit bucket for ${r.title}`}
              value={r.bucket_id ?? ''}
              bucketName={r.bucket}
              options={bucketOptions}
              disabled={editDisabled}
              onChange={(v) =>
                onCommitField?.(r.id, {
                  bucket_id: v === '' ? null : v,
                  bucket: bucketOptions.find((b) => b.id === v)?.name ?? 'No bucket',
                })
              }
            />
          ) : (
            <BucketPill name={r.bucket} />
          ),
      },
      {
        key: 'priority',
        header: 'Priority',
        width: pixel(130),
        renderCell: (r) => (
          <PriorityCell
            label={`Edit priority for ${r.title}`}
            value={r.priority}
            disabled={editDisabled}
            onChange={(v) => onCommitField?.(r.id, { priority: v })}
          />
        ),
      },
      {
        key: 'assignees',
        header: 'Assignees',
        width: pixel(130),
        renderCell: (r) => (
          <button
            type="button"
            aria-label={`Edit assignees for ${r.title}`}
            onClick={() => onOpenTask?.(r.id)}
            className="inline-flex min-w-0 items-center gap-1 rounded-sm border-0 bg-transparent p-0 hover:opacity-80"
          >
            {r.assignees.length === 0 ? (
              <span className="text-sm text-disabled">—</span>
            ) : (
              <AvatarStack
                assignees={r.assignees.map((a) => ({
                  user_id: a.id,
                  display_name: a.name,
                }))}
              />
            )}
          </button>
        ),
      },
      {
        key: 'start',
        header: 'Start',
        width: pixel(150),
        renderCell: (r) => (
          <DateCell
            label={`Edit start date for ${r.title}`}
            value={r.start}
            disabled={editDisabled}
            disabledMessage={editDisabledReason}
            onChange={(v) => onCommitField?.(r.id, { start: v })}
          />
        ),
      },
      {
        key: 'due',
        header: 'Due',
        width: pixel(150),
        renderCell: (r) => (
          <DateCell
            label={`Edit due date for ${r.title}`}
            value={r.due}
            overdue={isOverdue(r.due)}
            disabled={editDisabled}
            disabledMessage={editDisabledReason}
            onChange={(v) => onCommitField?.(r.id, { due: v })}
          />
        ),
      },
      {
        key: 'labels',
        header: 'Labels',
        width: proportional(1, { minWidth: 120 }),
        renderCell: (r) => (
          <button
            type="button"
            aria-label={`Edit labels for ${r.title}`}
            onClick={() => onOpenTask?.(r.id)}
            className="inline-flex min-w-0 items-center gap-1 rounded-sm border-0 bg-transparent p-0 hover:opacity-80"
          >
            {r.labels.length === 0 ? (
              <span className="text-sm text-disabled">—</span>
            ) : (
              <>
                <LabelChip name={r.labels[0]?.name ?? ''} />
                {r.labels.length > 1 && (
                  <span className="text-sm text-secondary">+{r.labels.length - 1}</span>
                )}
              </>
            )}
          </button>
        ),
      },
    ],
    [
      selection,
      toggleSelect,
      editing,
      editDisabled,
      editDisabledReason,
      bucketOptions,
      onCommitField,
      onOpenTask,
    ],
  );

  const renderGroupHeader = useCallback(
    (key: string, count: number) => {
      const header = formatGroupHeader(groupBy, key);
      return (
        <span className="flex items-center gap-2">
          <StatusToneDot tone={header.status} label={header.label} />
          <span className="text-base font-semibold text-primary">{header.label}</span>
          <span className="text-sm text-secondary">{count}</span>
        </span>
      );
    },
    [groupBy],
  );

  const renderGroupFooter = useCallback(
    (key: string) => {
      const groupBucketId = bucketIdByGroup.get(key) ?? null;
      if (addingBucketId === groupBucketId) {
        return (
          <AddTaskRow
            onCommit={(title) => onAddTask?.(title, groupBucketId)}
            onCancel={() => onCancelAdd?.()}
          />
        );
      }
      return (
        <DisabledActionTooltip
          disabled={Boolean(addTaskDisabledReason)}
          reason={addTaskDisabledReason}
        >
          <button
            type="button"
            disabled={Boolean(addTaskDisabledReason)}
            onClick={() => onAddTask?.('__open__', groupBucketId)}
            className="flex w-full items-center gap-1.5 px-3 py-2 text-base text-secondary hover:bg-surface hover:text-primary"
          >
            <span className="text-base leading-none">+</span> Add a task
          </button>
        </DisabledActionTooltip>
      );
    },
    [bucketIdByGroup, addingBucketId, onAddTask, onCancelAdd, addTaskDisabledReason],
  );

  // The select column always leads; persisted prefs only track data columns.
  // Columns added after a user saved their prefs (e.g. 'start') are merged in
  // at their natural position instead of being hidden by the stale order.
  const activeColumnOrder = useMemo(() => {
    if (!columnOrder) return undefined;
    const natural = columns.map((c) => c.key);
    const merged = columnOrder.filter((k) => k !== 'select' && natural.includes(k));
    for (const key of natural) {
      if (key === 'select' || merged.includes(key)) continue;
      const naturalIdx = natural.indexOf(key);
      let insertAt = 0;
      for (let i = 0; i < merged.length; i++) {
        const other = merged[i];
        if (other !== undefined && natural.indexOf(other) < naturalIdx) insertAt = i + 1;
      }
      merged.splice(insertAt, 0, key);
    }
    return ['select', ...merged];
  }, [columnOrder, columns]);

  return (
    <div className="flex flex-1 flex-col overflow-auto bg-card">
      <GroupedGrid<TaskGridRow>
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        getRowLabel={(r) => r.title}
        groupBy={groupKeyOf}
        groupOrder={groupOrder}
        renderGroupHeader={renderGroupHeader}
        renderGroupFooter={groupBy === 'bucket' ? renderGroupFooter : undefined}
        collapsedGroups={collapsedGroups}
        onToggleGroup={(key) =>
          setCollapsedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
          })
        }
        onRowClick={onRowClick ? (id) => onRowClick(id) : undefined}
        activeRowId={activeRowId}
        highlightedRowIds={selection}
        columnWidths={columnWidths}
        onColumnWidthsChange={onColumnWidthsChange}
        columnOrder={activeColumnOrder}
        onColumnOrderChange={
          onColumnOrderChange
            ? (next) => onColumnOrderChange(next.filter((k) => k !== 'select'))
            : undefined
        }
      />
    </div>
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
      autoFocus
      className="w-full rounded-sm border border-accent-bg bg-body px-1.5 py-1 text-base text-primary outline-none"
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
  disabled?: boolean;
  onChange: (next: TaskGridRow['status']) => void;
}

function StatusCell({ label, value, disabled, onChange }: StatusCellProps) {
  const current = STATUS_OPTIONS.find((o) => o.value === value) ?? STATUS_OPTIONS[0];
  if (!current) return null;
  return (
    <DropdownMenu
      placement="below"
      menuWidth={180}
      hasChevron={!disabled}
      button={{
        label,
        variant: 'ghost',
        size: 'sm',
        isDisabled: disabled,
        children: (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <StatusToneDot tone={current.tone} label={current.label} />
            <span className="truncate">{current.label}</span>
          </span>
        ),
      }}
    >
      {STATUS_OPTIONS.map((o) => (
        <DropdownMenuItem
          key={o.value}
          icon={<StatusToneDot tone={o.tone} label={o.label} />}
          label={o.label}
          onClick={() => o.value !== value && onChange(o.value)}
        />
      ))}
    </DropdownMenu>
  );
}

interface PriorityCellProps {
  label: string;
  value: TaskGridRow['priority'];
  disabled?: boolean;
  onChange: (next: TaskGridRow['priority']) => void;
}

function PriorityCell({ label, value, disabled, onChange }: PriorityCellProps) {
  const current = PRIORITY_OPTIONS.find((o) => o.value === value) ?? PRIORITY_OPTIONS[2];
  if (!current) return null;
  return (
    <DropdownMenu
      placement="below"
      menuWidth={180}
      hasChevron={!disabled}
      button={{
        label,
        variant: 'ghost',
        size: 'sm',
        isDisabled: disabled,
        children: (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <PriorityIcon level={value} />
            <span className="truncate">{current.label}</span>
          </span>
        ),
      }}
    >
      {PRIORITY_OPTIONS.map((o) => (
        <DropdownMenuItem
          key={o.value}
          icon={<PriorityIcon level={o.value} />}
          label={o.label}
          onClick={() => o.value !== value && onChange(o.value)}
        />
      ))}
    </DropdownMenu>
  );
}

interface BucketCellProps {
  label: string;
  value: string;
  bucketName: string;
  options: ReadonlyArray<BucketOption>;
  disabled?: boolean;
  onChange: (next: string) => void;
}

function BucketCell({ label, value, bucketName, options, disabled, onChange }: BucketCellProps) {
  return (
    <DropdownMenu
      placement="below"
      menuWidth={200}
      hasChevron={false}
      button={{
        label,
        variant: 'ghost',
        size: 'sm',
        isDisabled: disabled,
        children: <BucketPill name={bucketName} />,
      }}
    >
      <DropdownMenuItem
        icon={<StatusToneDot tone="muted" label="No bucket" />}
        label="No bucket"
        onClick={() => value !== '' && onChange('')}
      />
      {options.map((o) => (
        <DropdownMenuItem
          key={o.id}
          icon={<StatusToneDot tone={bucketStatusForName(o.name)} label={o.name} />}
          label={o.name}
          onClick={() => o.id !== value && onChange(o.id)}
        />
      ))}
    </DropdownMenu>
  );
}

function BucketPill({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2 py-0.5 text-sm text-primary">
      <StatusToneDot tone={bucketStatusForName(name)} label={name} />
      <span className="truncate">{name}</span>
    </span>
  );
}

// Timestamptz ISO in the row ⇄ YYYY-MM-DD in the DateInput. Anchor commits at
// UTC midnight so the picked day round-trips identically in any timezone
// (same contract as TaskDetailScheduleCard).
function toDateValue(iso: string | null): string | undefined {
  return iso ? iso.slice(0, 10) : undefined;
}

function fromDateValue(v: string | undefined): string | null {
  return v ? `${v}T00:00:00.000Z` : null;
}

interface DateCellProps {
  label: string;
  value: string | null;
  overdue?: boolean;
  disabled?: boolean;
  disabledMessage?: string;
  onChange: (next: string | null) => void;
}

function DateCell({ label, value, overdue, disabled, disabledMessage, onChange }: DateCellProps) {
  return (
    <DateInput
      label={label}
      isLabelHidden
      size="sm"
      hasClear
      value={toDateValue(value)}
      isDisabled={disabled}
      disabledMessage={disabled ? disabledMessage : undefined}
      status={overdue ? { type: 'error' } : undefined}
      onChange={(v) => onChange(fromDateValue(v))}
    />
  );
}

interface AddTaskRowProps {
  onCommit: (title: string) => void;
  onCancel: () => void;
}

function AddTaskRow({ onCommit, onCancel }: AddTaskRowProps) {
  const committedRef = useRef(false);
  useEffect(() => {
    committedRef.current = false;
  }, []);

  return (
    <div className="flex min-h-11 items-center border border-accent-bg bg-body px-3 shadow-[0_0_0_1px_var(--color-accent)]">
      <input
        type="text"
        placeholder="Task name"
        aria-label="New task title"
        autoFocus
        className="w-full rounded-sm border-0 bg-transparent px-1.5 py-1 text-base text-primary outline-none placeholder:text-disabled"
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
