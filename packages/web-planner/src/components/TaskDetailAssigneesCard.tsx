import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import type { TaskWithAssigneesRow } from '@seta/planner';
import {
  Avatar,
  createStaticSource,
  DisabledActionTooltip,
  type SearchableItem,
  Typeahead,
} from '@seta/shared-ui';
import { usePermission, useSession } from '@seta/web-identity';
import { GripVertical, Sparkles, X, Zap } from 'lucide-react';
import { useMemo } from 'react';
import { useAssignTask } from '../hooks/mutations/assign-task';
import { useMoveToTopOfMyList } from '../hooks/mutations/move-to-top-of-my-list';
import { useReorderTaskAssignees } from '../hooks/mutations/reorder-task-assignees';
import { useUnassignTask } from '../hooks/mutations/unassign-task';
import { useAssigneeSuggestions } from '../hooks/queries/use-assignee-suggestions';
import { useGroupMembers } from '../hooks/queries/use-group-members';
import { PERMISSION_DENIED } from '../lib/permission-messages';
import { computeAssigneeReorder } from './assignee-reorder';
import { formatSuggestionReason, scorePercent } from './assignee-suggestion-format';

interface Props {
  task: TaskWithAssigneesRow;
  planId: string;
  groupId: string;
  isLinkedToM365?: boolean;
}

function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => p.charAt(0))
    .join('')
    .toUpperCase();
}

function hueFromUserId(userId: string): number {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return h % 360;
}

function userAvatarStyle(userId: string) {
  const hue = hueFromUserId(userId);
  return {
    background: `hsl(${hue} 60% 88%)`,
    color: `hsl(${hue} 40% 22%)`,
  };
}

export function TaskDetailAssigneesCard({
  task,
  planId,
  groupId,
  isLinkedToM365: _isLinkedToM365 = false,
}: Props) {
  const session = useSession();
  const reorder = useReorderTaskAssignees();
  const moveToTop = useMoveToTopOfMyList();
  const assign = useAssignTask(planId);
  const unassign = useUnassignTask(planId);
  const canAssign = usePermission('planner.task.assign');
  const noAssignReason = PERMISSION_DENIED.task.assign;

  const isCurrentUserAssigned = task.assignees.some((a) => a.user_id === session.user_id);

  type AssigneeItem = SearchableItem<{
    email?: string;
    isAiMatch: boolean;
    scorePct?: number;
    reason?: string;
  }>;

  const membersQ = useGroupMembers(groupId);
  // Gating this behind the Typeahead's own onOpenChange (as the picker-open
  // boolean previously did) is a dead end: BaseTypeahead's hasEntriesOnFocus
  // bootstrap snapshots the dropdown's item list synchronously off a focus
  // event (via a microtask), while onOpenChange only fires *inside* that same
  // bootstrap continuation — so the suggestions fetch can't even start until
  // after the snapshot is taken, and BaseTypeahead never re-runs bootstrap
  // when searchSource changes later. Gate on canAssign instead: it's resolved
  // before first render, so AI suggestions are already in `items` by the time
  // the field is ever focused, and users without assign rights never trigger
  // the fetch at all.
  const suggestionsQ = useAssigneeSuggestions(task.id, canAssign);

  const items: AssigneeItem[] = useMemo(() => {
    const assignedIds = new Set(task.assignees.map((a) => a.user_id));
    const suggested = (suggestionsQ.data ?? [])
      .filter((s) => !assignedIds.has(s.user_id))
      .map<AssigneeItem>((s) => ({
        id: s.user_id,
        label: s.display_name,
        auxiliaryData: {
          isAiMatch: true,
          scorePct: scorePercent(s),
          reason: formatSuggestionReason(s),
        },
      }));
    const suggestedIds = new Set(suggested.map((i) => i.id));
    const members = (membersQ.data?.members ?? [])
      .filter((m) => !assignedIds.has(m.user_id) && !suggestedIds.has(m.user_id))
      .map<AssigneeItem>((m) => ({
        id: m.user_id,
        label: m.display_name,
        auxiliaryData: { isAiMatch: false, email: m.email },
      }));
    return [...suggested, ...members]; // AI-matched first (sorted to top)
  }, [suggestionsQ.data, membersQ.data, task.assignees]);

  const source = useMemo(
    () =>
      createStaticSource<AssigneeItem>(items, {
        keywords: (i) => (i.auxiliaryData?.email ? [i.auxiliaryData.email] : []),
      }),
    [items],
  );

  const onDragEnd = (result: DropResult) => {
    if (!canAssign) return;
    if (!result.destination) return;
    const ids = task.assignees.map((a) => a.user_id);
    const newOrder = computeAssigneeReorder(ids, result.source.index, result.destination.index);
    if (!newOrder) return;
    reorder.mutate({ task_id: task.id, newOrder: newOrder.map((user_id) => ({ user_id })) });
  };

  return (
    <section className="card" aria-label="Assignees">
      <header className="mb-2 flex items-center justify-between gap-2">
        <span className="t-sm subtle">Assignees</span>
      </header>

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId={`assignees-${task.id}`} type="ASSIGNEES">
          {(dp) => (
            <div ref={dp.innerRef} {...dp.droppableProps} className="flex flex-col gap-1">
              {task.assignees.map((a, idx) => (
                <Draggable key={a.user_id} draggableId={a.user_id} index={idx}>
                  {(dpc) => (
                    <div
                      ref={dpc.innerRef}
                      {...dpc.draggableProps}
                      className="flex items-center gap-2 rounded-sm px-1 py-1.5"
                      style={dpc.draggableProps.style ?? undefined}
                    >
                      <button
                        type="button"
                        aria-label="Drag handle"
                        {...(canAssign ? dpc.dragHandleProps : {})}
                        disabled={!canAssign}
                        className={`border-none bg-transparent p-0 text-ink-tertiary ${canAssign ? 'cursor-grab' : 'cursor-not-allowed opacity-40'}`}
                      >
                        <GripVertical className="size-3.5" />
                      </button>
                      <Avatar name={a.display_name} size={24} />
                      <div className="min-w-0 flex-1">
                        <div className="t-sm text-ink">{a.display_name}</div>
                        <div className="t-xs subtle">{idx === 0 ? 'driver' : 'reviewer'}</div>
                      </div>
                      <DisabledActionTooltip
                        disabled={!canAssign}
                        reason={PERMISSION_DENIED.task.assign}
                      >
                        <button
                          type="button"
                          aria-label={`Remove ${a.display_name}`}
                          onClick={() => unassign.mutate({ task_id: task.id, user_id: a.user_id })}
                          disabled={!canAssign}
                          className="cursor-pointer border-none bg-transparent p-1 text-ink-subtle disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <X className="size-3" />
                        </button>
                      </DisabledActionTooltip>
                    </div>
                  )}
                </Draggable>
              ))}
              {dp.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      <div className="mt-1.5">
        <Typeahead<AssigneeItem>
          label="Add assignee"
          isLabelHidden
          size="sm"
          placeholder="Search group members…"
          searchSource={source}
          debounceMs={0}
          hasEntriesOnFocus
          isDisabled={!canAssign}
          disabledMessage={noAssignReason}
          value={null}
          onChange={(item) => {
            if (!item) return;
            assign.mutate({
              task_id: task.id,
              user_id: item.id,
              display_name: item.label,
              email: item.auxiliaryData?.email,
            });
          }}
          emptySearchResultsText="No group members found."
          renderItem={(item) => (
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                style={userAvatarStyle(item.id)}
              >
                {initialsOf(item.label)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body-sm leading-tight text-ink">{item.label}</span>
                <span className="truncate text-caption leading-tight text-ink-subtle">
                  {item.auxiliaryData?.isAiMatch
                    ? item.auxiliaryData.reason
                    : item.auxiliaryData?.email}
                </span>
              </span>
              {item.auxiliaryData?.isAiMatch && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-tint px-1.5 py-0.5 text-caption font-semibold text-primary-ink">
                  <Sparkles className="size-3" aria-hidden style={{ color: '#6d5cff' }} />
                  {item.auxiliaryData.scorePct}%
                </span>
              )}
            </div>
          )}
        />
      </div>

      {isCurrentUserAssigned && (
        <DisabledActionTooltip disabled={!canAssign} reason={noAssignReason}>
          <button
            type="button"
            onClick={() => moveToTop.mutate({ task_id: task.id })}
            disabled={!canAssign}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-md border border-dashed border-primary-border bg-primary-tint px-2.5 py-1.5 text-caption font-semibold text-primary-ink enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Zap className="size-3" />
            Move to top of my list
          </button>
        </DisabledActionTooltip>
      )}
    </section>
  );
}
