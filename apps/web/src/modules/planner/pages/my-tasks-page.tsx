import { DragDropContext, type DropResult } from '@hello-pangea/dnd';
import type { MyTasksResult, TaskWithPlan } from '@seta/planner';
import { Alert, AlertDescription, Button, EmptyState, PageChrome, Skeleton } from '@seta/shared-ui';
import { useNavigate } from '@tanstack/react-router';
import { generateKeyBetween } from 'fractional-indexing';
import { CheckCircle2 } from 'lucide-react';
import { useMemo } from 'react';
import { MtSection, type MyTasksSection } from '../components/my-tasks/mt-section';
import type { MyTasksRowTask } from '../components/my-tasks/mt-task-row';
import { MyTasksToolbar, type PlanOption } from '../components/my-tasks/my-tasks-toolbar';
import type { PlanGroupData } from '../components/my-tasks/plan-group';
import type { SectionKey, SectionTone } from '../components/my-tasks/types';
import { useSetAssigneePriority } from '../hooks/mutations/use-set-assignee-priority';
import { useMyTasks } from '../hooks/queries/use-my-tasks';
import type { MyTasksFilters } from '../state/query-keys';

interface SectionSpec {
  key: SectionKey;
  label: string;
  tone: SectionTone;
  bucket: keyof MyTasksResult;
  hint?: string;
  defaultOpen: boolean;
}

const SECTION_SPECS: ReadonlyArray<SectionSpec> = [
  { key: 'late', label: 'Late', tone: 'danger', bucket: 'late', defaultOpen: true },
  {
    key: 'week',
    label: 'Due this week',
    tone: 'warning',
    bucket: 'dueThisWeek',
    defaultOpen: true,
  },
  {
    key: 'in_progress',
    label: 'In progress',
    tone: 'primary',
    bucket: 'inProgress',
    defaultOpen: false,
  },
  {
    key: 'not_started',
    label: 'Not started',
    tone: 'muted',
    bucket: 'notStarted',
    defaultOpen: false,
  },
  {
    key: 'done',
    label: 'Recently completed',
    tone: 'success',
    bucket: 'recentlyCompleted',
    defaultOpen: false,
    hint: 'last 14 days',
  },
];

function groupTasksByPlan(tasks: ReadonlyArray<TaskWithPlan>): PlanGroupData[] {
  const byPlan = new Map<string, { plan: TaskWithPlan['plan']; tasks: MyTasksRowTask[] }>();
  for (const t of tasks) {
    const existing = byPlan.get(t.plan.id);
    if (existing) {
      existing.tasks.push(t as MyTasksRowTask);
    } else {
      byPlan.set(t.plan.id, { plan: t.plan, tasks: [t as MyTasksRowTask] });
    }
  }
  return Array.from(byPlan.values()).map(({ plan, tasks: groupTasks }) => ({
    plan: { id: plan.id, name: plan.name, color: '#0047FF' },
    group: { id: plan.group_id, name: '' },
    tasks: groupTasks,
  }));
}

function mapSection(spec: SectionSpec, data: MyTasksResult): MyTasksSection {
  const tasks = data[spec.bucket];
  return {
    key: spec.key,
    label: spec.label,
    tone: spec.tone,
    count: tasks.length,
    open: spec.defaultOpen,
    hint: spec.hint,
    groups: groupTasksByPlan(tasks),
  };
}

function buildSubtitle(data: MyTasksResult): string {
  const open =
    data.late.length + data.dueThisWeek.length + data.inProgress.length + data.notStarted.length;
  return `${open} open · ${data.late.length} late · ${data.dueThisWeek.length} due this week`;
}

function totalCount(data: MyTasksResult): number {
  return (
    data.late.length +
    data.dueThisWeek.length +
    data.inProgress.length +
    data.notStarted.length +
    data.recentlyCompleted.length
  );
}

export function findNeighbors(
  data: MyTasksResult,
  droppableId: string,
  taskId: string,
  index: number,
): { prev: string | null; next: string | null } {
  const parts = droppableId.split(':');
  if (parts.length !== 3) return { prev: null, next: null };
  const sectionKey = parts[1] as SectionKey;
  const planId = parts[2];
  const spec = SECTION_SPECS.find((s) => s.key === sectionKey);
  if (!spec) return { prev: null, next: null };
  const tasks = data[spec.bucket].filter((t) => t.plan.id === planId && t.id !== taskId);
  return {
    prev: tasks[index - 1]?.assignee_priority ?? null,
    next: tasks[index]?.assignee_priority ?? null,
  };
}

interface Props {
  filters: MyTasksFilters;
  onFiltersChange: (next: MyTasksFilters) => void;
}

export function MyTasksPage({ filters, onFiltersChange }: Props) {
  const q = useMyTasks(filters);
  const setPrio = useSetAssigneePriority();
  const navigate = useNavigate();

  const planOptions: PlanOption[] = useMemo(() => {
    if (!q.data) return [];
    const seen = new Map<string, string>();
    for (const arr of [
      q.data.late,
      q.data.dueThisWeek,
      q.data.inProgress,
      q.data.notStarted,
      q.data.recentlyCompleted,
    ]) {
      for (const t of arr) if (!seen.has(t.plan.id)) seen.set(t.plan.id, t.plan.name);
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [q.data]);

  const groupOptions: PlanOption[] = useMemo(() => {
    if (!q.data) return [];
    const seen = new Set<string>();
    for (const arr of [
      q.data.late,
      q.data.dueThisWeek,
      q.data.inProgress,
      q.data.notStarted,
      q.data.recentlyCompleted,
    ]) {
      for (const t of arr) {
        const gid = t.plan.group_id;
        if (gid) seen.add(gid);
      }
    }
    return Array.from(seen).map((id) => ({ id, name: id }));
  }, [q.data]);

  function handleDragEnd(result: DropResult) {
    if (!result.destination || !q.data) return;
    if (result.source.droppableId !== result.destination.droppableId) return;
    if (result.source.index === result.destination.index) return;
    const { prev, next } = findNeighbors(
      q.data,
      result.destination.droppableId,
      result.draggableId,
      result.destination.index,
    );
    try {
      const value = generateKeyBetween(prev, next);
      setPrio.mutate({ taskId: result.draggableId, value });
    } catch {
      // generateKeyBetween throws when prev >= next; abort and rely on
      // server-side ordering + cache invalidation on next fetch to recover
    }
  }

  const subtitle = q.data ? buildSubtitle(q.data) : undefined;
  const hasData = q.data !== undefined;
  const total = q.data ? totalCount(q.data) : 0;

  return (
    <PageChrome
      breadcrumb={['Planner']}
      title="My tasks"
      subtitle={subtitle}
      toolbar={
        <MyTasksToolbar
          value={{
            planId: filters.planId,
            groupId: filters.groupId,
            priority: filters.priority,
            due: filters.due,
            view: filters.view ?? 'list',
            search: filters.search,
          }}
          planOptions={planOptions}
          groupOptions={groupOptions}
          onChange={(patch) => onFiltersChange({ ...filters, ...patch })}
          onSearchChange={(s) => onFiltersChange({ ...filters, search: s || undefined })}
        />
      }
    >
      {q.isPending && (
        <PageBody>
          <MyTasksSkeleton />
        </PageBody>
      )}
      {q.isError && (
        <PageBody>
          <MyTasksError onRetry={() => void q.refetch()} />
        </PageBody>
      )}
      {hasData && total === 0 && (
        <PageBody>
          <MyTasksEmpty onBrowse={() => void navigate({ to: '/planner/groups' })} />
        </PageBody>
      )}
      {hasData && total > 0 && q.data && (
        <DragDropContext onDragEnd={handleDragEnd}>
          <PageBody>
            {SECTION_SPECS.map((spec) => (
              <MtSection key={spec.key} section={mapSection(spec, q.data)} />
            ))}
          </PageBody>
        </DragDropContext>
      )}
    </PageChrome>
  );
}

function PageBody({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface-1 px-6 py-2 pb-8 min-h-full">
      <div className="max-w-[1180px] mx-auto flex flex-col gap-2">{children}</div>
    </div>
  );
}

function MyTasksSkeleton() {
  return (
    <div data-testid="my-tasks-skeleton" className="flex flex-col gap-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          data-testid="mt-section-skeleton"
          className="rounded-md border border-hairline overflow-hidden"
        >
          <Skeleton className="h-9 w-full" />
          {i < 2 && <Skeleton className="h-11 w-full mt-px" />}
        </div>
      ))}
    </div>
  );
}

function MyTasksError({ onRetry }: { onRetry: () => void }) {
  return (
    <Alert variant="destructive" data-testid="my-tasks-error">
      <AlertDescription className="flex items-center justify-between gap-3">
        <span>Couldn't load your tasks.</span>
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function MyTasksEmpty({ onBrowse }: { onBrowse?: () => void }) {
  return (
    <div data-testid="my-tasks-empty">
      <EmptyState
        icon={<CheckCircle2 className="size-8" />}
        title="Nothing assigned"
        description="Browse plans to find work to pick up."
        action={onBrowse ? { label: 'Browse plans', onClick: onBrowse } : undefined}
      />
    </div>
  );
}
