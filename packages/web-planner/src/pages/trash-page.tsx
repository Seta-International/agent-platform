// biome-ignore-all lint/a11y/useSemanticElements: intentional div+role="table"/"row"/"cell" markup to escape native table layout constraints; a11y semantics preserved via explicit roles.
// biome-ignore-all lint/a11y/useFocusableInteractive: row/cell roles are decorative grid wrappers, not interactive elements; focus targets live inside (buttons).
import {
  Badge,
  Banner,
  BreadcrumbItem,
  Breadcrumbs,
  Button,
  Dialog,
  DialogHeader,
  DisabledActionTooltip,
  EmptyState,
  formatRelative,
  Layout,
  LayoutContent,
  LayoutFooter,
  LayoutHeader,
  Skeleton,
  Tab,
  TabList,
  Text,
  VStack,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { CheckSquare, Layers, RotateCcw, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { useDeleteArchivedPlan } from '../hooks/mutations/delete-archived-plan';
import { useRestoreGroup } from '../hooks/mutations/restore-group';
import { useRestorePlan } from '../hooks/mutations/restore-plan';
import { useRestoreTask } from '../hooks/mutations/restore-task';
import { useUnarchivePlan } from '../hooks/mutations/unarchive-plan';
import { useTrash } from '../hooks/queries/use-trash';
import { PERMISSION_DENIED } from '../lib/permission-messages';

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
    return <Badge variant="error" label="Expiring" />;
  }
  if (days <= 7) {
    return <Badge variant="warning" label={`${days}d left`} />;
  }
  return <Badge variant="neutral" label={`${days}d left`} />;
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
  const [tab, setTab] = useState('deleted');
  const closePurgeDialog = () => setConfirmingPurge(null);

  const canUpdatePlan = usePermission('planner.plan.update');
  const canDeletePlan = usePermission('planner.plan.delete');
  const canUpdateGroup = usePermission('planner.group.update');
  const canUpdateTask = usePermission('planner.task.update');

  // Restoring an item is an "update" on that item's resource. Gate the per-row Restore by kind.
  const restoreGate: Record<TrashKind, { allowed: boolean; reason: string }> = {
    group: { allowed: canUpdateGroup, reason: PERMISSION_DENIED.group.restore },
    plan: { allowed: canUpdatePlan, reason: PERMISSION_DENIED.plan.restore },
    task: { allowed: canUpdateTask, reason: PERMISSION_DENIED.task.restore },
  };

  if (q.isPending) {
    return (
      <Layout
        height="fill"
        header={
          <LayoutHeader hasDivider padding={4}>
            <VStack gap={1}>
              <Breadcrumbs variant="supporting">
                <BreadcrumbItem href="/planner">Planner</BreadcrumbItem>
                <BreadcrumbItem isCurrent>Trash</BreadcrumbItem>
              </Breadcrumbs>
              <Text as="h1" size="lg" weight="semibold">
                Trash
              </Text>
            </VStack>
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={0}>
            <div data-testid="skeleton-trash" className="space-y-3 p-6">
              <Skeleton height={48} />
              <Skeleton height={48} />
              <Skeleton height={48} />
            </div>
          </LayoutContent>
        }
      />
    );
  }

  if (q.isError) {
    return (
      <Layout
        height="fill"
        header={
          <LayoutHeader hasDivider padding={4}>
            <VStack gap={1}>
              <Breadcrumbs variant="supporting">
                <BreadcrumbItem href="/planner">Planner</BreadcrumbItem>
                <BreadcrumbItem isCurrent>Trash</BreadcrumbItem>
              </Breadcrumbs>
              <Text as="h1" size="lg" weight="semibold">
                Trash
              </Text>
            </VStack>
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={0}>
            <div className="p-6">
              <Banner
                status="error"
                role="alert"
                title="Couldn&apos;t load trash."
                endContent={
                  <Button size="sm" variant="secondary" label="Retry" onClick={() => q.refetch()} />
                }
              />
            </div>
          </LayoutContent>
        }
      />
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
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={1}>
            <Breadcrumbs variant="supporting">
              <BreadcrumbItem href="/planner">Planner</BreadcrumbItem>
              <BreadcrumbItem isCurrent>Trash</BreadcrumbItem>
            </Breadcrumbs>
            <Text as="h1" size="lg" weight="semibold">
              Trash
            </Text>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
          <div className="flex flex-col">
            <div className="border-b border-hairline px-7 pt-4">
              <TabList value={tab} onChange={setTab} aria-label="Trash">
                <Tab
                  value="deleted"
                  label="Deleted"
                  endContent={
                    rows.length > 0 ? <Badge variant="neutral" label={rows.length} /> : undefined
                  }
                />
                <Tab
                  value="archived"
                  label="Archived"
                  endContent={
                    archivedRows.length > 0 ? (
                      <Badge variant="neutral" label={archivedRows.length} />
                    ) : undefined
                  }
                />
              </TabList>
            </div>

            {tab === 'deleted' &&
              (rows.length === 0 ? (
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
                          <div
                            role="cell"
                            className="text-xs text-ink-muted"
                            suppressHydrationWarning
                          >
                            {r.deleted_at ? formatRelative(r.deleted_at) : '—'}
                          </div>
                          <div role="cell">
                            <DaysBadge days={days} />
                          </div>
                          <div role="cell" className="flex justify-end gap-1">
                            <DisabledActionTooltip
                              disabled={!restoreGate[r.kind].allowed}
                              reason={restoreGate[r.kind].reason}
                            >
                              <Button
                                variant="ghost"
                                size="sm"
                                icon={<RotateCcw className="size-3" aria-hidden />}
                                label="Restore"
                                onClick={() => onRestore(r)}
                                isDisabled={!restoreGate[r.kind].allowed}
                              />
                            </DisabledActionTooltip>
                            <DisabledActionTooltip
                              disabled={!canPermanentlyDelete}
                              reason={PERMISSION_DENIED.trash.permanentDelete}
                            >
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-semantic-danger hover:text-semantic-danger"
                                icon={<Trash2 className="size-3" aria-hidden />}
                                label="Delete"
                                onClick={() => setConfirmingPurge(r)}
                                isDisabled={!canPermanentlyDelete}
                              />
                            </DisabledActionTooltip>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

            {tab === 'archived' &&
              (archivedRows.length === 0 ? (
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
                        <div
                          role="cell"
                          className="text-xs text-ink-muted"
                          suppressHydrationWarning
                        >
                          {r.archived_at ? formatRelative(r.archived_at) : '—'}
                        </div>
                        <div role="cell" className="flex justify-end gap-1">
                          <DisabledActionTooltip
                            disabled={!canUpdatePlan}
                            reason={PERMISSION_DENIED.plan.restore}
                          >
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={<RotateCcw className="size-3" aria-hidden />}
                              label="Restore"
                              onClick={() => unarchivePlan.mutate({ plan_id: r.id })}
                              isDisabled={!canUpdatePlan}
                            />
                          </DisabledActionTooltip>
                          <DisabledActionTooltip
                            disabled={!canDeletePlan}
                            reason={PERMISSION_DENIED.plan.delete}
                          >
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-semantic-danger hover:text-semantic-danger"
                              icon={<Trash2 className="size-3" aria-hidden />}
                              label="Delete"
                              onClick={() =>
                                deleteArchivedPlan.mutate({
                                  plan_id: r.id,
                                  expected_version: r.version,
                                })
                              }
                              isDisabled={!canDeletePlan}
                            />
                          </DisabledActionTooltip>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>

          <Dialog
            isOpen={confirmingPurge !== null}
            onOpenChange={(v) => {
              if (!v) closePurgeDialog();
            }}
            purpose="required"
          >
            <Layout
              header={
                <DialogHeader
                  title={`Permanently delete "${confirmingPurge?.name ?? ''}"?`}
                  subtitle="You won't be able to get this back."
                  onOpenChange={(v) => {
                    if (!v) closePurgeDialog();
                  }}
                />
              }
              content={<LayoutContent />}
              footer={
                <LayoutFooter hasDivider>
                  <Button variant="ghost" label="Cancel" onClick={closePurgeDialog} />
                  <Button
                    variant="destructive"
                    label="Permanently delete"
                    onClick={() => {
                      // The backend's hard-delete endpoint is policy-driven (RETENTION_DAYS sweep, not
                      // a manual API); this dialog confirms intent until that endpoint lands.
                      setConfirmingPurge(null);
                    }}
                  />
                </LayoutFooter>
              }
            />
          </Dialog>
        </LayoutContent>
      }
    />
  );
}
