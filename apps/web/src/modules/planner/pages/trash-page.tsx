// biome-ignore-all lint/a11y/useSemanticElements: intentional div+role="table"/"row"/"cell" markup to escape native table layout constraints; a11y semantics preserved via explicit roles.
// biome-ignore-all lint/a11y/useFocusableInteractive: row/cell roles are decorative grid wrappers, not interactive elements; focus targets live inside (buttons).
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  formatRelative,
  PageChrome,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@seta/shared-ui';
import { CheckSquare, Layers, RotateCcw, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { useDeleteArchivedPlan } from '../hooks/mutations/delete-archived-plan';
import { useRestoreGroup } from '../hooks/mutations/restore-group';
import { useRestorePlan } from '../hooks/mutations/restore-plan';
import { useRestoreTask } from '../hooks/mutations/restore-task';
import { useUnarchivePlan } from '../hooks/mutations/unarchive-plan';
import { useTrash } from '../hooks/queries/use-trash';

type TrashKind = 'group' | 'plan' | 'task';

type TrashRow =
  | { kind: 'group'; id: string; name: string; deleted_at: string | null }
  | { kind: 'plan'; id: string; name: string; deleted_at: string | null; group_id?: string }
  | { kind: 'task'; id: string; name: string; deleted_at: string | null; plan_id?: string };

const RETENTION_DAYS = 30;

const GRID_TEMPLATE = '120px 1.7fr 160px 130px 220px';

const KIND_META: Record<TrashKind, { label: string; Icon: typeof Users; iconClass: string }> = {
  group: { label: 'Group', Icon: Users, iconClass: 'text-primary' },
  plan: { label: 'Plan', Icon: Layers, iconClass: 'text-info' },
  task: { label: 'Task', Icon: CheckSquare, iconClass: 'text-ink-subtle' },
};

function daysRemaining(deletedAt: string | null): number | null {
  if (!deletedAt) return null;
  const expires = new Date(deletedAt).getTime() + RETENTION_DAYS * 86_400_000;
  const days = Math.ceil((expires - Date.now()) / 86_400_000);
  return Math.max(0, days);
}

function DaysBadge({ days }: { days: number | null }) {
  if (days === null) {
    return <span className="text-ink-tertiary">—</span>;
  }
  if (days === 0) {
    return <Badge variant="destructive">Expiring</Badge>;
  }
  if (days <= 7) {
    return <Badge variant="warning">{days}d left</Badge>;
  }
  return <Badge variant="secondary">{days}d left</Badge>;
}

interface Props {
  /** When true, the user can permanently delete trashed items. Gated by org.admin / tenant.admin. */
  canPermanentlyDelete?: boolean;
}

export function TrashPage({ canPermanentlyDelete = false }: Props) {
  const q = useTrash();
  const restoreTask = useRestoreTask();
  const restoreGroup = useRestoreGroup();
  const restorePlan = useRestorePlan();
  const unarchivePlan = useUnarchivePlan();
  const deleteArchivedPlan = useDeleteArchivedPlan();
  const [confirmingPurge, setConfirmingPurge] = useState<TrashRow | null>(null);

  if (q.isPending) {
    return (
      <PageChrome breadcrumb={['Planner']} title="Trash">
        <div data-testid="skeleton-trash" className="space-y-3 p-6">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </PageChrome>
    );
  }

  if (q.isError) {
    return (
      <PageChrome breadcrumb={['Planner']} title="Trash">
        <div className="p-6">
          <Alert variant="destructive" role="alert">
            <AlertDescription className="flex items-center justify-between gap-3">
              <span>Couldn&apos;t load trash.</span>
              <Button size="sm" variant="secondary" onClick={() => q.refetch()}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      </PageChrome>
    );
  }

  const trashedPlanIds = new Set(q.data.plans.map((p) => p.id));

  const archivedRows = q.data.archivedPlans.map((p) => ({
    id: p.id,
    name: p.name,
    archived_at: p.archived_at,
    group_id: p.group_id,
    version: p.version,
  }));

  const rows: TrashRow[] = [
    ...q.data.groups.map((g) => ({
      kind: 'group' as const,
      id: g.id,
      name: g.name,
      deleted_at: g.deleted_at,
    })),
    ...q.data.plans.map((p) => ({
      kind: 'plan' as const,
      id: p.id,
      name: p.name,
      deleted_at: p.deleted_at,
      group_id: p.group_id,
    })),
    ...q.data.tasks.map((t) => ({
      kind: 'task' as const,
      id: t.id,
      name: t.title,
      deleted_at: t.deleted_at,
      plan_id: t.plan_id,
    })),
  ];

  function onRestore(r: TrashRow) {
    if (r.kind === 'task') {
      if (r.plan_id && trashedPlanIds.has(r.plan_id)) {
        const confirmed = window.confirm(
          "This task's plan was deleted too. Restore the plan first?",
        );
        if (!confirmed) return;
        restorePlan.mutate({ plan_id: r.plan_id });
      }
      restoreTask.mutate({ task_id: r.id });
    }
    if (r.kind === 'plan') restorePlan.mutate({ plan_id: r.id });
    if (r.kind === 'group') restoreGroup.mutate({ group_id: r.id });
  }

  return (
    <PageChrome breadcrumb={['Planner']} title="Trash">
      <Tabs defaultValue="deleted" className="flex flex-col">
        <div className="border-b border-hairline px-7 pt-4">
          <TabsList>
            <TabsTrigger value="deleted">
              Deleted
              {rows.length > 0 && (
                <Badge variant="secondary" className="ml-1.5">
                  {rows.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="archived">
              Archived
              {archivedRows.length > 0 && (
                <Badge variant="secondary" className="ml-1.5">
                  {archivedRows.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="deleted" className="mt-0">
          {rows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No deleted items"
                description={`Anything you delete sits here for ${RETENTION_DAYS} days, then it's gone for good.`}
              />
            </div>
          ) : (
            <div role="table" aria-label="Deleted items" className="w-full">
              <div
                role="row"
                className="sticky top-0 z-10 grid items-center gap-2 border-b border-hairline bg-canvas px-7 py-2.5 text-[11px] font-medium uppercase tracking-wider text-ink-subtle"
                style={{ gridTemplateColumns: GRID_TEMPLATE }}
              >
                <div role="columnheader">Type</div>
                <div role="columnheader">Name</div>
                <div role="columnheader">Deleted</div>
                <div role="columnheader">Retention</div>
                <div role="columnheader" className="text-right">
                  <span className="sr-only">Actions</span>
                </div>
              </div>
              <div role="rowgroup">
                {rows.map((r) => {
                  const days = daysRemaining(r.deleted_at);
                  const meta = KIND_META[r.kind];
                  const Icon = meta.Icon;
                  return (
                    <div
                      role="row"
                      key={`${r.kind}:${r.id}`}
                      className="grid items-center gap-2 border-b border-hairline-tertiary px-7 py-3 text-sm text-ink transition-colors hover:bg-surface-1"
                      style={{ gridTemplateColumns: GRID_TEMPLATE }}
                    >
                      <div role="cell" className="flex items-center gap-2 text-ink-subtle">
                        <Icon className={`size-3.5 shrink-0 ${meta.iconClass}`} aria-hidden />
                        <span className="text-xs">{meta.label}</span>
                      </div>
                      <div role="cell" className="min-w-0 pr-4">
                        <p className="truncate font-medium text-ink">{r.name}</p>
                      </div>
                      <div role="cell" className="text-xs text-ink-muted" suppressHydrationWarning>
                        {r.deleted_at ? formatRelative(r.deleted_at) : '—'}
                      </div>
                      <div role="cell">
                        <DaysBadge days={days} />
                      </div>
                      <div role="cell" className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => onRestore(r)}>
                          <RotateCcw className="size-3" aria-hidden /> Restore
                        </Button>
                        {canPermanentlyDelete && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-semantic-danger hover:text-semantic-danger"
                            onClick={() => setConfirmingPurge(r)}
                          >
                            <Trash2 className="size-3" aria-hidden /> Delete
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="archived" className="mt-0">
          {archivedRows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No archived plans"
                description="Archived plans will appear here."
              />
            </div>
          ) : (
            <div role="table" aria-label="Archived plans" className="w-full">
              <div
                role="row"
                className="sticky top-0 z-10 grid items-center gap-2 border-b border-hairline bg-canvas px-7 py-2.5 text-[11px] font-medium uppercase tracking-wider text-ink-subtle"
                style={{ gridTemplateColumns: '120px 1.7fr 160px 220px' }}
              >
                <div role="columnheader">Type</div>
                <div role="columnheader">Name</div>
                <div role="columnheader">Archived</div>
                <div role="columnheader" className="text-right">
                  <span className="sr-only">Actions</span>
                </div>
              </div>
              <div role="rowgroup">
                {archivedRows.map((r) => (
                  <div
                    role="row"
                    key={`archived:${r.id}`}
                    className="grid items-center gap-2 border-b border-hairline-tertiary px-7 py-3 text-sm text-ink transition-colors hover:bg-surface-1"
                    style={{ gridTemplateColumns: '120px 1.7fr 160px 220px' }}
                  >
                    <div role="cell" className="flex items-center gap-2 text-ink-subtle">
                      <Layers className="size-3.5 shrink-0 text-info" aria-hidden />
                      <span className="text-xs">Plan</span>
                    </div>
                    <div role="cell" className="min-w-0 pr-4">
                      <p className="truncate font-medium text-ink">{r.name}</p>
                    </div>
                    <div role="cell" className="text-xs text-ink-muted" suppressHydrationWarning>
                      {r.archived_at ? formatRelative(r.archived_at) : '—'}
                    </div>
                    <div role="cell" className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => unarchivePlan.mutate({ plan_id: r.id })}
                      >
                        <RotateCcw className="size-3" aria-hidden /> Restore
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-semantic-danger hover:text-semantic-danger"
                        onClick={() =>
                          deleteArchivedPlan.mutate({
                            plan_id: r.id,
                            expected_version: r.version,
                          })
                        }
                      >
                        <Trash2 className="size-3" aria-hidden /> Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog
        open={confirmingPurge !== null}
        onOpenChange={(v) => {
          if (!v) setConfirmingPurge(null);
        }}
      >
        <DialogContent className="max-w-[480px]">
          <DialogHeader>
            <DialogTitle>
              Permanently delete &ldquo;{confirmingPurge?.name ?? ''}&rdquo;?
            </DialogTitle>
            <DialogDescription>You won&apos;t be able to get this back.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmingPurge(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                // The backend's hard-delete endpoint is policy-driven (RETENTION_DAYS sweep, not
                // a manual API); this dialog confirms intent until that endpoint lands.
                setConfirmingPurge(null);
              }}
            >
              Permanently delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageChrome>
  );
}
