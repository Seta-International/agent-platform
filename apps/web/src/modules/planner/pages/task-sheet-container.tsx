import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  formatRelative,
  TaskSheet,
} from '@seta/shared-ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { TaskSheetProperties } from '../components/task-sheet-properties';
import { useAddChecklistItem } from '../hooks/mutations/add-checklist-item';
import { useApplyLabel } from '../hooks/mutations/apply-label';
import { useAssignTask } from '../hooks/mutations/assign-task';
import { useCompleteTask } from '../hooks/mutations/complete-task';
import { useDeleteTask } from '../hooks/mutations/delete-task';
import { useMoveTask } from '../hooks/mutations/move-task';
import { useRemoveChecklistItem } from '../hooks/mutations/remove-checklist-item';
import { useReopenTask } from '../hooks/mutations/reopen-task';
import { useUnapplyLabel } from '../hooks/mutations/unapply-label';
import { useUnassignTask } from '../hooks/mutations/unassign-task';
import { useUpdateChecklistItem } from '../hooks/mutations/update-checklist-item';
import { useUpdateTask } from '../hooks/mutations/update-task';
import { useGroupMembers } from '../hooks/queries/use-group-members';
import { usePlanBoard } from '../hooks/queries/use-plan-board';
import { useTask } from '../hooks/queries/use-task';
import { useTaskChecklist } from '../hooks/queries/use-task-checklist';
import { useTaskEvents } from '../hooks/queries/use-task-events';
import { useSheetKeyboard } from '../hooks/use-sheet-keyboard';
import { useSavingIds } from '../state/saving-ids';

interface Props {
  taskId: string;
  planId: string;
  onClose: () => void;
  /** Ordered task ids in the current view, used for J/K navigation. */
  taskIdsInView?: ReadonlyArray<string>;
  onNavigateTask?: (taskId: string) => void;
}

export function TaskSheetContainer({
  taskId,
  planId,
  onClose,
  taskIdsInView,
  onNavigateTask,
}: Props) {
  const taskQ = useTask(taskId);
  const boardQ = usePlanBoard(planId);
  const groupId = boardQ.data?.plan.group_id;
  const membersQ = useGroupMembers(groupId ?? '');
  const checklistQ = useTaskChecklist(taskId);
  const eventsQ = useTaskEvents(taskId);

  const updateTask = useUpdateTask(planId);
  const moveTask = useMoveTask(planId);
  const assignTask = useAssignTask(planId);
  const unassignTask = useUnassignTask(planId);
  const applyLabel = useApplyLabel(planId);
  const unapplyLabel = useUnapplyLabel(planId);
  const deleteTask = useDeleteTask(planId);
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

  const { prevTaskId, nextTaskId } = useMemo(() => {
    if (!taskIdsInView) return { prevTaskId: undefined, nextTaskId: undefined };
    const idx = taskIdsInView.indexOf(taskId);
    if (idx === -1) return { prevTaskId: undefined, nextTaskId: undefined };
    return {
      prevTaskId: idx > 0 ? taskIdsInView[idx - 1] : undefined,
      nextTaskId: idx < taskIdsInView.length - 1 ? taskIdsInView[idx + 1] : undefined,
    };
  }, [taskIdsInView, taskId]);

  function markDone() {
    const t = taskQ.data;
    if (!t || t.deleted_at) return;
    if (t.progress === 'completed') {
      reopenTask.mutate({ task_id: t.id, expected_version: t.version });
    } else {
      completeTask.mutate({ task_id: t.id, expected_version: t.version });
    }
  }

  useSheetKeyboard({
    onClose,
    onEditTitle: () => titleInputRef.current?.focus(),
    onPrev: prevTaskId && onNavigateTask ? () => onNavigateTask(prevTaskId) : undefined,
    onNext: nextTaskId && onNavigateTask ? () => onNavigateTask(nextTaskId) : undefined,
    onSubmit: () => {
      if (editingDesc) commitDescription();
      else markDone();
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
    // Surface the last actor from the most recent task.deleted event if present; else fall back.
    const deletedEvent = eventsQ.data?.pages
      .flatMap((p) => p.events)
      .find((e) => e.event_type === 'planner.task.deleted');
    const actor =
      (deletedEvent?.payload as { actor_display_name?: string } | undefined)?.actor_display_name ??
      'another user';
    return <TaskSheet title={task.title} onClose={onClose} deletedBy={actor} />;
  }

  const items = checklistQ.data ?? [];
  const checkedCount = items.filter((i) => i.checked).length;
  const events = eventsQ.data?.pages.flatMap((p) => p.events) ?? [];

  const buckets = boardQ.data?.buckets ?? [];
  const labels = boardQ.data?.labels ?? [];
  const members = membersQ.data ?? [];

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
    <TaskSheetProperties
      status={task.progress}
      onStatusChange={(next) => {
        if (next === 'completed' && task.progress !== 'completed') {
          completeTask.mutate({ task_id: task.id, expected_version: task.version });
        } else if (next !== 'completed' && task.progress === 'completed') {
          reopenTask.mutate({ task_id: task.id, expected_version: task.version });
        }
        // not_started ↔ in_progress ↔ deferred without complete/reopen has no API yet.
      }}
      bucketId={task.bucket_id}
      bucketOptions={buckets.map((b) => ({ id: b.id, name: b.name }))}
      onBucketChange={(next) =>
        moveTask.mutate({
          task_id: task.id,
          expected_version: task.version,
          to_bucket_id: next,
        })
      }
      priority={task.priority}
      onPriorityChange={(next) =>
        updateTask.mutate({
          task_id: task.id,
          expected_version: task.version,
          patch: { priority: next },
        })
      }
      due={task.due_at}
      onDueChange={(next) =>
        updateTask.mutate({
          task_id: task.id,
          expected_version: task.version,
          patch: { due_at: next ?? undefined },
        })
      }
      assignees={task.assignees.map((a) => ({
        user_id: a.user_id,
        display_name: a.display_name,
      }))}
      memberOptions={members.map((m) => ({ user_id: m.user_id, display_name: m.display_name }))}
      onAssign={(uid) => assignTask.mutate({ task_id: task.id, user_id: uid })}
      onUnassign={(uid) => unassignTask.mutate({ task_id: task.id, user_id: uid })}
      appliedLabels={task.labels.map((l) => ({ id: l.id, name: l.name, color: l.color }))}
      labelOptions={labels.map((l) => ({ id: l.id, name: l.name, color: l.color }))}
      onApplyLabel={(lid) => applyLabel.mutate({ task_id: task.id, label_id: lid })}
      onUnapplyLabel={(lid) => unapplyLabel.mutate({ task_id: task.id, label_id: lid })}
      reviewState={task.review_state}
      onReviewStateChange={(next) =>
        updateTask.mutate({
          task_id: task.id,
          expected_version: task.version,
          patch: { review_state: next ?? undefined },
        })
      }
      skillTags={task.skill_tags}
      onSkillTagsChange={(next) =>
        updateTask.mutate({
          task_id: task.id,
          expected_version: task.version,
          patch: { skill_tags: next },
        })
      }
      checklistChecked={checkedCount}
      checklistTotal={items.length}
    />
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

  const subtitle = `T-${task.id.slice(-4)} · ${task.progress.replace('_', ' ')} · Created ${formatRelative(task.created_at)} ago`;

  const overflowMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Task actions" className="task-sheet__overflow">
          ⋯
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() => {
            void navigator.clipboard.writeText(window.location.href);
          }}
        >
          Copy link
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            deleteTask.mutate({ task_id: task.id, expected_version: task.version });
            onClose();
          }}
          className="text-semantic-danger"
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <TaskSheet
      title={task.title}
      subtitle={subtitle}
      headerActions={overflowMenu}
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
            title="Reopen (⌘↵)"
            onClick={() => reopenTask.mutate({ task_id: task.id, expected_version: task.version })}
          >
            Reopen
          </button>
        ) : (
          <button
            type="button"
            title="Mark done (⌘↵)"
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
