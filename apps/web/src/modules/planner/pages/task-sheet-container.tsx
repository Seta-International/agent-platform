import { ProgressBar, TaskSheet } from '@seta/shared-ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAddChecklistItem } from '../hooks/mutations/add-checklist-item';
import { useCompleteTask } from '../hooks/mutations/complete-task';
import { useRemoveChecklistItem } from '../hooks/mutations/remove-checklist-item';
import { useReopenTask } from '../hooks/mutations/reopen-task';
import { useUpdateChecklistItem } from '../hooks/mutations/update-checklist-item';
import { useUpdateTask } from '../hooks/mutations/update-task';
import { useTask } from '../hooks/queries/use-task';
import { useTaskChecklist } from '../hooks/queries/use-task-checklist';
import { useTaskEvents } from '../hooks/queries/use-task-events';
import { useSheetKeyboard } from '../hooks/use-sheet-keyboard';
import { useSavingIds } from '../state/saving-ids';

interface Props {
  taskId: string;
  planId: string;
  onClose: () => void;
}

export function TaskSheetContainer({ taskId, planId, onClose }: Props) {
  const taskQ = useTask(taskId);
  const checklistQ = useTaskChecklist(taskId);
  const eventsQ = useTaskEvents(taskId);
  const updateTask = useUpdateTask(planId);
  const completeTask = useCompleteTask(planId);
  const reopenTask = useReopenTask(planId);
  const addItem = useAddChecklistItem(planId, taskId);
  const updateItem = useUpdateChecklistItem(planId, taskId);
  const removeItem = useRemoveChecklistItem(planId, taskId);
  const saving = useSavingIds((s) => s.ids.has(taskId));

  const [editingDesc, setEditingDesc] = useState(false);
  const [draftDesc, setDraftDesc] = useState('');
  const descTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (editingDesc) descTextareaRef.current?.focus();
  }, [editingDesc]);

  // Stable callback so useSheetKeyboard's onSubmit can reference it before the task data guard.
  // Reads taskQ.data at call time, so it is always current even though it's defined before the
  // early-return guards below.
  const commitDescription = useCallback(() => {
    const task = taskQ.data;
    if (!task || task.deleted_at) return;
    if (draftDesc !== (task.description ?? '')) {
      updateTask.mutate({
        task_id: task.id,
        expected_version: task.version,
        patch: { description: draftDesc },
      });
    }
    setEditingDesc(false);
  }, [taskQ.data, draftDesc, updateTask]);

  const titleInputRef = useRef<HTMLInputElement | null>(null);

  useSheetKeyboard({
    onClose,
    onEditTitle: () => titleInputRef.current?.focus(),
    onSubmit: () => {
      // Commit description draft if the textarea is active; otherwise no-op.
      if (editingDesc) commitDescription();
    },
  });

  if (taskQ.isPending) {
    return <TaskSheet title="Loading…" onClose={onClose} />;
  }
  if (taskQ.isError || !taskQ.data) {
    return <TaskSheet title="Couldn't load task" onClose={onClose} />;
  }

  const task = taskQ.data;
  if (task.deleted_at) {
    return <TaskSheet title={task.title} onClose={onClose} deletedBy="someone" />;
  }

  const items = checklistQ.data ?? [];
  const checkedCount = items.filter((i) => i.checked).length;
  const events = eventsQ.data?.pages.flatMap((p) => p.events) ?? [];

  const description = (
    <>
      <h3 className="task-sheet__section-title">Description</h3>
      {editingDesc ? (
        <textarea
          ref={descTextareaRef}
          rows={6}
          value={draftDesc}
          onChange={(e) => setDraftDesc(e.target.value)}
          onBlur={commitDescription}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              (e.target as HTMLTextAreaElement).blur();
            }
            if (e.key === 'Escape') {
              setEditingDesc(false);
              setDraftDesc('');
            }
          }}
        />
      ) : task.description ? (
        <button
          type="button"
          className="task-sheet__description-trigger"
          onClick={() => {
            setDraftDesc(task.description ?? '');
            setEditingDesc(true);
          }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{task.description}</ReactMarkdown>
        </button>
      ) : (
        <button
          type="button"
          className="task-sheet__placeholder"
          onClick={() => {
            setDraftDesc('');
            setEditingDesc(true);
          }}
        >
          Click to add a description
        </button>
      )}
    </>
  );

  const properties = (
    <>
      <h3 className="task-sheet__section-title">Properties</h3>
      <dl className="task-sheet__props">
        <dt>Status</dt>
        <dd>{task.progress.replace('_', ' ')}</dd>
        <dt>Priority</dt>
        <dd>{task.priority}</dd>
        <dt>Due</dt>
        <dd>{task.due_at ? new Date(task.due_at).toLocaleDateString() : '—'}</dd>
        <dt>Skill tags</dt>
        <dd>{task.skill_tags.join(', ') || '—'}</dd>
        <dt>Progress</dt>
        <dd>
          <ProgressBar value={checkedCount} total={items.length || 1} />
        </dd>
      </dl>
    </>
  );

  const checklist = (
    <>
      <h3 className="task-sheet__section-title">
        Checklist ({checkedCount} / {items.length})
      </h3>
      <ul className="task-sheet__checklist">
        {items.map((it) => (
          <li key={it.id}>
            <input
              type="checkbox"
              checked={it.checked}
              onChange={(e) =>
                updateItem.mutate({ item_id: it.id, patch: { checked: e.target.checked } })
              }
              aria-label={it.label}
            />
            <input
              type="text"
              aria-label={`Edit label: ${it.label}`}
              defaultValue={it.label}
              onBlur={(e) => {
                if (e.target.value !== it.label) {
                  updateItem.mutate({ item_id: it.id, patch: { label: e.target.value } });
                }
              }}
            />
            <button
              type="button"
              onClick={() => removeItem.mutate({ item_id: it.id })}
              aria-label={`Remove ${it.label}`}
            >
              ×
            </button>
          </li>
        ))}
        <li>
          <button type="button" onClick={() => addItem.mutate({ label: 'New item' })}>
            + Add item
          </button>
        </li>
      </ul>
    </>
  );

  const activity = (
    <>
      <h3 className="task-sheet__section-title">Activity</h3>
      <ol className="task-sheet__activity">
        {events.map((e) => (
          <li key={String(e.id)}>
            <span className="event-type">{e.event_type.replace('planner.', '')}</span>
            <time>{new Date(e.occurred_at).toLocaleString()}</time>
          </li>
        ))}
      </ol>
      {eventsQ.hasNextPage && (
        <button type="button" onClick={() => eventsQ.fetchNextPage()}>
          Show more
        </button>
      )}
    </>
  );

  return (
    <TaskSheet
      title={task.title}
      subtitle={`T-${task.id.slice(-4)} · ${task.progress.replace('_', ' ')}`}
      description={description}
      properties={properties}
      checklist={checklist}
      activity={activity}
      onClose={onClose}
      saving={saving}
      footer={
        task.progress === 'completed' ? (
          <button
            type="button"
            onClick={() => reopenTask.mutate({ task_id: task.id, expected_version: task.version })}
          >
            Reopen
          </button>
        ) : (
          <button
            type="button"
            onClick={() =>
              completeTask.mutate({ task_id: task.id, expected_version: task.version })
            }
          >
            Mark done
          </button>
        )
      }
    />
  );
}
