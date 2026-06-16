import { DragDropContext, type DropResult } from '@hello-pangea/dnd';
import type { MyTasksResult } from '@seta/planner';
import { Alert, AlertDescription, Button, EmptyState, PageChrome, Skeleton } from '@seta/shared-ui';
import { useNavigate } from '@tanstack/react-router';
import { generateKeyBetween } from 'fractional-indexing';
import { CheckCircle2 } from 'lucide-react';
import { useMemo } from 'react';
import { MtSection, type MyTasksSection } from '../components/my-tasks/mt-section';
import type { MyTasksRowTask } from '../components/my-tasks/mt-task-row';
import { MyTasksGrid } from '../components/my-tasks/my-tasks-grid';
import { MyTasksToolbar, type PlanOption } from '../components/my-tasks/my-tasks-toolbar';
import { useSetAssigneePriority } from '../hooks/mutations/use-set-assignee-priority';
import { useMyGroups } from '../hooks/queries/use-my-groups';
import { useMyTasks } from '../hooks/queries/use-my-tasks';
import { findNeighbors, SECTION_SPECS, type SectionSpec } from '../lib/my-tasks-sections';
import type { MyTasksFilters } from '../state/query-keys';

function mapSection(spec: SectionSpec, data: MyTasksResult): MyTasksSection {
  const tasks = data[spec.bucket] as ReadonlyArray<MyTasksRowTask>;
  return {
    key: spec.key,
    label: spec.label,
    tone: spec.tone,
    count: tasks.length,
    open: spec.defaultOpen,
    hint: spec.hint,
    tasks,
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

interface Props {
  filters: MyTasksFilters;
  onFiltersChange: (next: MyTasksFilters) => void;
}

export function MyTasksPage({ filters, onFiltersChange }: Props) {
  const q = useMyTasks(filters);
  const groupsQ = useMyGroups();
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
    const usedIds = new Set<string>();
    for (const arr of [
      q.data.late,
      q.data.dueThisWeek,
      q.data.inProgress,
      q.data.notStarted,
      q.data.recentlyCompleted,
    ]) {
      for (const t of arr) {
        const gid = t.plan.group_id;
        if (gid) usedIds.add(gid);
      }
    }
    const nameById = new Map((groupsQ.data ?? []).map((g) => [g.id, g.name] as const));
    return Array.from(usedIds).map((id) => ({ id, name: nameById.get(id) ?? id }));
  }, [q.data, groupsQ.data]);

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
      {hasData && total > 0 && q.data && filters.view === 'grid' && (
        <div className="flex h-full flex-col">
          <div className="flex-1 overflow-auto">
            <MyTasksGrid data={q.data} />
          </div>
          <MyTasksFooter data={q.data} total={total} />
        </div>
      )}
      {hasData && total > 0 && q.data && filters.view !== 'grid' && (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex h-full flex-col">
            <div className="flex-1 overflow-auto">
              {SECTION_SPECS.map((spec) => (
                <MtSection key={spec.key} section={mapSection(spec, q.data)} />
              ))}
            </div>
            <MyTasksFooter data={q.data} total={total} />
          </div>
        </DragDropContext>
      )}
    </PageChrome>
  );
}

function PageBody({ children }: { children: React.ReactNode }) {
  return <div className="page-container">{children}</div>;
}

function MyTasksFooter({ data, total }: { data: MyTasksResult; total: number }) {
  const open =
    data.late.length + data.dueThisWeek.length + data.inProgress.length + data.notStarted.length;
  return (
    <footer className="flex h-11 flex-none items-center justify-between border-t border-hairline bg-canvas px-6 text-xs text-ink-muted">
      <span>
        {open} open · {data.late.length} late · {data.dueThisWeek.length} due this week ·{' '}
        {data.recentlyCompleted.length} recently completed
      </span>
      <span className="text-ink-subtle">
        {total} {total === 1 ? 'task' : 'tasks'} assigned to you
      </span>
    </footer>
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
        <span>Couldn&apos;t load your tasks.</span>
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Try again
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
        title="You&apos;re all caught up"
        description="Nothing is assigned to you right now. Pick up something from a plan."
        action={onBrowse ? { label: 'Browse plans', onClick: onBrowse } : undefined}
      />
    </div>
  );
}
