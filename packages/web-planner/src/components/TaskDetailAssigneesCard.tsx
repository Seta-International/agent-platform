import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import type { TaskWithAssigneesRow } from '@seta/planner';
import {
  Avatar,
  AvatarFallback,
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  DisabledActionTooltip,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@seta/shared-ui';
import { usePermission, useSession } from '@seta/web-identity';
import { GripVertical, Plus, Sparkles, X, Zap } from 'lucide-react';
import { useState } from 'react';
import { useAssignTask } from '../hooks/mutations/assign-task';
import { useMoveToTopOfMyList } from '../hooks/mutations/move-to-top-of-my-list';
import { useReorderTaskAssignees } from '../hooks/mutations/reorder-task-assignees';
import { useUnassignTask } from '../hooks/mutations/unassign-task';
import { useAssigneeSuggestions } from '../hooks/queries/use-assignee-suggestions';
import { useGroupMemberAssigneeSearch } from '../hooks/use-group-member-assignee-search';
import { PERMISSION_DENIED } from '../lib/permission-messages';
import { computeAssigneeReorder } from './assignee-reorder';
import { formatSuggestionReason, scorePercent } from './assignee-suggestion-format';
import { SuggestionScoreTooltip } from './suggestion-score-tooltip';

interface Props {
  task: TaskWithAssigneesRow;
  planId: string;
  groupId: string;
  isLinkedToM365?: boolean;
}

// Brand-cohesive "intelligence" gradient: Seta blue → indigo → cyan.
// Signals the AI-matched zone without the cliché purple-on-white slop.
const AI_GRADIENT = 'linear-gradient(120deg, #0047FF 0%, #6d5cff 46%, #22d3ee 100%)';

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

  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const memberQuery = useGroupMemberAssigneeSearch(groupId, search, pickerOpen);
  const suggestionsQ = useAssigneeSuggestions(task.id, pickerOpen);

  const filteredSuggestions = (suggestionsQ.data ?? []).filter((s) => {
    const term = search.trim().toLowerCase();
    return term.length === 0 || s.display_name.toLowerCase().includes(term);
  });

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
                      <Avatar className="size-6">
                        <AvatarFallback>{initialsOf(a.display_name)}</AvatarFallback>
                      </Avatar>
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
        <Popover open={pickerOpen} onOpenChange={(o) => canAssign && setPickerOpen(o)}>
          <DisabledActionTooltip disabled={!canAssign} reason={noAssignReason}>
            <PopoverTrigger asChild disabled={!canAssign}>
              <Button size="sm" variant="ghost" aria-label="Add assignee" disabled={!canAssign}>
                <Plus className="size-3" />
                Add assignee
              </Button>
            </PopoverTrigger>
          </DisabledActionTooltip>
          <PopoverContent align="start" className="w-80 p-0">
            <Command shouldFilter={false}>
              <CommandInput
                aria-label="Search group members"
                placeholder="Search group members"
                value={search}
                onValueChange={setSearch}
              />
              <CommandList>
                <CommandEmpty>
                  {memberQuery.isPending && search ? 'Searching…' : 'No group members found.'}
                </CommandEmpty>
                <TooltipProvider delayDuration={200}>
                  <CommandGroup
                    heading={
                      <span className="inline-flex items-center gap-1.5 uppercase tracking-wide">
                        <Sparkles
                          className="size-3 animate-pulse"
                          style={{ color: '#6d5cff' }}
                          aria-hidden
                        />
                        <span
                          className="bg-clip-text font-semibold text-transparent"
                          style={{ backgroundImage: AI_GRADIENT }}
                        >
                          AI matches
                        </span>
                      </span>
                    }
                  >
                    {suggestionsQ.isPending && (
                      <div className="px-2 py-1.5 text-caption text-ink-subtle">
                        Loading suggestions…
                      </div>
                    )}
                    {suggestionsQ.isError && (
                      <div className="px-2 py-1.5 text-caption text-ink-subtle">
                        Couldn't load suggestions
                      </div>
                    )}
                    {suggestionsQ.isSuccess && filteredSuggestions.length === 0 && (
                      <div className="px-2 py-1.5 text-caption text-ink-subtle">
                        No strong matches
                      </div>
                    )}
                    {suggestionsQ.isSuccess &&
                      filteredSuggestions.map((s) => {
                        const already = task.assignees.some((a) => a.user_id === s.user_id);
                        return (
                          <CommandItem
                            key={`suggested-${s.user_id}`}
                            value={`suggested-${s.user_id}`}
                            disabled={already}
                            onSelect={() =>
                              assign.mutate({
                                task_id: task.id,
                                user_id: s.user_id,
                                display_name: s.display_name,
                              })
                            }
                            className="flex items-center gap-2.5"
                          >
                            <span
                              aria-hidden
                              className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                              style={userAvatarStyle(s.user_id)}
                            >
                              {initialsOf(s.display_name)}
                            </span>
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span className="truncate text-body-sm leading-tight text-ink">
                                {s.display_name}
                              </span>
                              <span className="truncate text-caption leading-tight text-ink-subtle">
                                {formatSuggestionReason(s)}
                              </span>
                            </span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="shrink-0 rounded-full bg-primary-tint px-1.5 py-0.5 text-caption font-semibold text-primary-ink">
                                  {scorePercent(s)}%
                                </span>
                              </TooltipTrigger>
                              <TooltipContent
                                side="left"
                                align="center"
                                collisionPadding={12}
                                className="z-[200] px-3 py-2"
                              >
                                <SuggestionScoreTooltip suggestion={s} />
                              </TooltipContent>
                            </Tooltip>
                            {already && (
                              <span className="shrink-0 text-caption text-ink-subtle">Added</span>
                            )}
                          </CommandItem>
                        );
                      })}
                  </CommandGroup>
                </TooltipProvider>
                <CommandGroup heading="All members">
                  {memberQuery.members.map((m) => {
                    const already = task.assignees.some((a) => a.user_id === m.user_id);
                    return (
                      <CommandItem
                        key={m.user_id}
                        value={m.user_id}
                        disabled={already}
                        onSelect={() => {
                          assign.mutate({
                            task_id: task.id,
                            user_id: m.user_id,
                            display_name: m.display_name,
                            email: m.email,
                          });
                        }}
                        className="flex items-center gap-2.5"
                      >
                        <span
                          aria-hidden
                          className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                          style={userAvatarStyle(m.user_id)}
                        >
                          {initialsOf(m.display_name)}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-body-sm leading-tight text-ink">
                            {m.display_name}
                          </span>
                          <span className="truncate text-caption leading-tight text-ink-subtle">
                            {m.email}
                          </span>
                        </span>
                        {already && (
                          <span className="shrink-0 text-caption text-ink-subtle">Added</span>
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
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
