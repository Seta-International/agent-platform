import { Fragment, useEffect, useMemo, useRef, useState } from 'react';

export interface TaskGridRow {
  id: string;
  title: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'deferred';
  bucket: string;
  priority: 'urgent' | 'important' | 'medium' | 'low';
  assignees: Array<{ id: string; name: string }>;
  due: string | null;
  labels: Array<{ id: string; name: string }>;
}

export type GroupBy = 'bucket' | 'assignee' | 'priority' | 'due' | 'label';

export interface TaskGridProps {
  rows: TaskGridRow[];
  groupBy: GroupBy;
  selection: Set<string>;
  onSelectionChange: (next: Set<string>) => void;
  onCommitField?: (taskId: string, patch: Partial<TaskGridRow>) => void;
  columnOrder?: string[];
  columnWidths?: Record<string, number>;
  onColumnOrderChange?: (next: string[]) => void;
  onColumnWidthsChange?: (next: Record<string, number>) => void;
}

export function TaskGrid({
  rows,
  groupBy,
  selection,
  onSelectionChange,
  onCommitField,
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

  function openTitleEditor(taskId: string) {
    setEditing({ taskId, field: 'title' });
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
                      onClick={() => openTitleEditor(r.id)}
                    >
                      {r.title}
                    </button>
                  )}
                </td>
                <td>{r.status.replaceAll('_', ' ')}</td>
                <td>{r.bucket}</td>
                <td>{r.priority}</td>
                <td>{r.assignees.map((a) => a.name).join(', ')}</td>
                <td>{r.due ?? '—'}</td>
                <td>{r.labels.map((l) => l.name).join(', ')}</td>
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
  // Tracks whether a commit/cancel was already triggered via keyboard so the
  // subsequent blur (fired when the input unmounts) does not double-commit.
  const committedRef = useRef(false);
  useEffect(() => {
    committedRef.current = false;
  }, []);

  return (
    <input
      type="text"
      // biome-ignore lint/a11y/noAutofocus: inline editor must steal focus immediately; without it keyboard users lose context after clicking the cell
      autoFocus
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

function groupRows(rows: TaskGridRow[], by: GroupBy): Map<string, TaskGridRow[]> {
  const m = new Map<string, TaskGridRow[]>();
  for (const r of rows) {
    let k: string;
    // groupBy assigns a task to one group only; the primary (first) assignee/label is used for
    // the join key so each task appears exactly once per view.
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
