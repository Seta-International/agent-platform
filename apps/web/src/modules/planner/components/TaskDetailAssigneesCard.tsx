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
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import { GripVertical, Info, Plus, X, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { listTenantUsers } from '../../identity/api/client';
import { useAssignTask } from '../hooks/mutations/assign-task';
import { useMoveToTopOfMyList } from '../hooks/mutations/move-to-top-of-my-list';
import { useReorderTaskAssignees } from '../hooks/mutations/reorder-task-assignees';
import { useUnassignTask } from '../hooks/mutations/unassign-task';
import { computeAssigneeReorder } from './assignee-reorder';

interface Props {
  task: TaskWithAssigneesRow;
  planId: string;
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

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

function useUserSearch(search: string, enabled: boolean, isLinkedToM365: boolean) {
  const debounced = useDebounced(search, 200);
  return useQuery({
    queryKey: [
      'identity',
      'admin-users',
      { search: debounced, sign_in_method: isLinkedToM365 ? 'microsoft' : null },
    ],
    queryFn: () =>
      listTenantUsers({
        search: debounced,
        limit: 8,
        offset: 0,
        ...(isLinkedToM365 ? { sign_in_method: 'microsoft' as const } : {}),
      }),
    enabled: enabled && debounced.length >= 1,
  });
}

function useUnfilteredUserCount(search: string, enabled: boolean) {
  const debounced = useDebounced(search, 200);
  return useQuery({
    queryKey: ['identity', 'admin-users', { search: debounced, sign_in_method: null }],
    queryFn: () => listTenantUsers({ search: debounced, limit: 8, offset: 0 }),
    enabled: enabled && debounced.length >= 1,
  });
}

export function TaskDetailAssigneesCard({ task, planId, isLinkedToM365 = false }: Props) {
  const reorder = useReorderTaskAssignees();
  const moveToTop = useMoveToTopOfMyList();
  const assign = useAssignTask(planId);
  const unassign = useUnassignTask(planId);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const userQuery = useUserSearch(search, pickerOpen, isLinkedToM365);
  const unfilteredQuery = useUnfilteredUserCount(search, pickerOpen && isLinkedToM365);

  const filteredTotal = userQuery.data?.total ?? 0;
  const unfilteredTotal = unfilteredQuery.data?.total ?? 0;
  const hiddenCount = isLinkedToM365 ? Math.max(0, unfilteredTotal - filteredTotal) : 0;
  const showHiddenFooter = isLinkedToM365 && hiddenCount > 0;

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const ids = task.assignees.map((a) => a.user_id);
    const newOrder = computeAssigneeReorder(ids, result.source.index, result.destination.index);
    if (!newOrder) return;
    reorder.mutate({ task_id: task.id, newOrder: newOrder.map((user_id) => ({ user_id })) });
  };

  return (
    <section className="card" aria-label="Assignees">
      <header className="mb-2">
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
                        {...dpc.dragHandleProps}
                        className="cursor-grab border-none bg-transparent p-0 text-ink-tertiary"
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
                      <button
                        type="button"
                        aria-label={`Remove ${a.display_name}`}
                        onClick={() => unassign.mutate({ task_id: task.id, user_id: a.user_id })}
                        className="cursor-pointer border-none bg-transparent p-1 text-ink-subtle"
                      >
                        <X className="size-3" />
                      </button>
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
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost" aria-label="Add assignee">
              <Plus className="size-3" />
              Add assignee
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-0">
            <Command shouldFilter={false}>
              <CommandInput
                aria-label="Search users"
                placeholder="Search users"
                value={search}
                onValueChange={setSearch}
              />
              <CommandList>
                <CommandEmpty>
                  {userQuery.isPending && search ? 'Searching…' : 'No users found.'}
                </CommandEmpty>
                <CommandGroup>
                  {(userQuery.data?.rows ?? []).map((u) => {
                    const already = task.assignees.some((a) => a.user_id === u.user_id);
                    return (
                      <CommandItem
                        key={u.user_id}
                        value={u.user_id}
                        disabled={already}
                        onSelect={() => {
                          assign.mutate({
                            task_id: task.id,
                            user_id: u.user_id,
                            display_name: u.name,
                            email: u.email,
                          });
                          setPickerOpen(false);
                          setSearch('');
                        }}
                      >
                        <span className="flex-1">{u.name}</span>
                        <span className="t-xs subtle">{u.email}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
                {showHiddenFooter ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          role="note"
                          className="flex items-center gap-1 border-t border-hairline px-3 py-2 text-caption text-ink-subtle"
                        >
                          <Info className="size-3" />
                          <span>
                            {hiddenCount} {hiddenCount === 1 ? 'person' : 'people'} hidden — not in
                            Microsoft 365
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        On linked plans, you can only assign people who have a Microsoft work
                        account.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : null}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <button
        type="button"
        onClick={() => moveToTop.mutate({ task_id: task.id })}
        className="mt-2.5 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-primary-border bg-primary-tint px-2.5 py-1.5 text-caption font-semibold text-primary-ink"
      >
        <Zap className="size-3" />
        Move to top of my list
      </button>
    </section>
  );
}
