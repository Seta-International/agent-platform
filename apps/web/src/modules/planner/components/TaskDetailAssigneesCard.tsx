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
} from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import { GripVertical, Plus, X, Zap } from 'lucide-react';
import { type CSSProperties, useEffect, useState } from 'react';
import { listAdminUsers } from '../../identity/api/client';
import { useAssignTask } from '../hooks/mutations/assign-task';
import { useMoveToTopOfMyList } from '../hooks/mutations/move-to-top-of-my-list';
import { useReorderTaskAssignees } from '../hooks/mutations/reorder-task-assignees';
import { useUnassignTask } from '../hooks/mutations/unassign-task';
import { computeAssigneeReorder } from './assignee-reorder';

interface Props {
  task: TaskWithAssigneesRow;
  planId: string;
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

function useUserSearch(search: string, enabled: boolean) {
  const debounced = useDebounced(search, 200);
  return useQuery({
    queryKey: ['identity', 'admin-users', { search: debounced }],
    queryFn: () => listAdminUsers({ search: debounced, limit: 8, offset: 0 }),
    enabled: enabled && debounced.length >= 1,
  });
}

export function TaskDetailAssigneesCard({ task, planId }: Props) {
  const reorder = useReorderTaskAssignees();
  const moveToTop = useMoveToTopOfMyList();
  const assign = useAssignTask(planId);
  const unassign = useUnassignTask(planId);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const userQuery = useUserSearch(search, pickerOpen);

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const ids = task.assignees.map((a) => a.user_id);
    const newOrder = computeAssigneeReorder(ids, result.source.index, result.destination.index);
    if (!newOrder) return;
    reorder.mutate({ task_id: task.id, newOrder: newOrder.map((user_id) => ({ user_id })) });
  };

  return (
    <section className="card" aria-label="Assignees">
      <header style={head}>
        <span className="t-sm subtle">Assignees</span>
      </header>

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId={`assignees-${task.id}`} type="ASSIGNEES">
          {(dp) => (
            <div ref={dp.innerRef} {...dp.droppableProps} style={list}>
              {task.assignees.map((a, idx) => (
                <Draggable key={a.user_id} draggableId={a.user_id} index={idx}>
                  {(dpc) => (
                    <div
                      ref={dpc.innerRef}
                      {...dpc.draggableProps}
                      style={{ ...row, ...(dpc.draggableProps.style ?? {}) }}
                    >
                      <button
                        type="button"
                        aria-label="Drag handle"
                        {...dpc.dragHandleProps}
                        style={handle}
                      >
                        <GripVertical className="size-3.5" />
                      </button>
                      <Avatar className="size-6">
                        <AvatarFallback>{initialsOf(a.display_name)}</AvatarFallback>
                      </Avatar>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="t-sm" style={{ color: 'var(--color-ink)' }}>
                          {a.display_name}
                        </div>
                        <div className="t-xs subtle">{idx === 0 ? 'driver' : 'reviewer'}</div>
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove ${a.display_name}`}
                        onClick={() => unassign.mutate({ task_id: task.id, user_id: a.user_id })}
                        style={removeBtn}
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

      <div style={addRow}>
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
                        <span style={{ flex: 1 }}>{u.name}</span>
                        <span className="t-xs subtle">{u.email}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <button
        type="button"
        onClick={() => moveToTop.mutate({ task_id: task.id })}
        style={moveTopBtn}
      >
        <Zap className="size-3" />
        Move to top of my list
      </button>
    </section>
  );
}

const head: CSSProperties = { marginBottom: 8 };
const list: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};
const row: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 4px',
  borderRadius: 4,
};
const handle: CSSProperties = {
  cursor: 'grab',
  background: 'transparent',
  border: 'none',
  color: 'var(--color-ink-tertiary)',
  padding: 0,
};
const removeBtn: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--color-ink-subtle)',
  cursor: 'pointer',
  padding: 4,
};
const addRow: CSSProperties = { marginTop: 6 };
const moveTopBtn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  marginTop: 10,
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px dashed var(--color-primary-border)',
  background: 'var(--color-primary-tint)',
  color: 'var(--color-primary-ink)',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
};
