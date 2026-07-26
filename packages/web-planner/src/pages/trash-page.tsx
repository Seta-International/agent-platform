import {
  Badge,
  Banner,
  BreadcrumbItem,
  Breadcrumbs,
  Button,
  Dialog,
  DialogFooter,
  DialogHeader,
  DropdownMenu,
  DropdownMenuItem,
  EmptyState,
  formatRelative,
  Input,
  Layout,
  LayoutContent,
  LayoutHeader,
  pixel,
  proportional,
  Selector,
  Skeleton,
  Table,
  type TableColumn,
  Text,
  Toolbar,
  VStack,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { CheckSquare, Layers, MoreHorizontal, Search, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { useDeleteArchivedPlan } from '../hooks/mutations/delete-archived-plan';
import { usePurgeGroup } from '../hooks/mutations/purge-group';
import { usePurgePlan } from '../hooks/mutations/purge-plan';
import { usePurgeTask } from '../hooks/mutations/purge-task';
import { useRestoreGroup } from '../hooks/mutations/restore-group';
import { useRestorePlan } from '../hooks/mutations/restore-plan';
import { useRestoreTask } from '../hooks/mutations/restore-task';
import { useUnarchivePlan } from '../hooks/mutations/unarchive-plan';
import { useTrash } from '../hooks/queries/use-trash';
import { PERMISSION_DENIED } from '../lib/permission-messages';

type TrashKind = 'group' | 'plan' | 'task';
type TrashStatus = 'deleted' | 'archived';

const RETENTION_DAYS = 30;

// One unified row for every trashed item (deleted or archived). `Record<string, unknown>` satisfies
// the Astryx Table's `T extends Record<string, unknown>` constraint without touching source DTOs.
interface TrashItem extends Record<string, unknown> {
  rowKey: string;
  status: TrashStatus;
  kind: TrashKind;
  id: string;
  name: string;
  /** deleted_at for deleted items, archived_at for archived plans. */
  date: string | null;
  plan_id?: string;
  group_id?: string;
  version?: number;
}

const STATUS_META: Record<TrashStatus, { label: string; variant: 'red' | 'orange' }> = {
  deleted: { label: 'Deleted', variant: 'red' },
  archived: { label: 'Archived', variant: 'orange' },
};

const STATUS_OPTIONS = [
  { value: 'deleted' as const, label: 'Deleted' },
  { value: 'archived' as const, label: 'Archived' },
];

const TYPE_OPTIONS = [
  { value: 'group' as const, label: 'Group' },
  { value: 'plan' as const, label: 'Plan' },
  { value: 'task' as const, label: 'Task' },
];

const KIND_META: Record<TrashKind, { label: string; Icon: typeof Users; iconClass: string }> = {
  group: { label: 'Group', Icon: Users, iconClass: 'text-accent' },
  plan: { label: 'Plan', Icon: Layers, iconClass: 'text-blue-vivid' },
  task: { label: 'Task', Icon: CheckSquare, iconClass: 'text-secondary' },
};

function daysRemaining(deletedAt: string | null): number | null {
  if (!deletedAt) return null;
  const expires = new Date(deletedAt).getTime() + RETENTION_DAYS * 86_400_000;
  const days = Math.ceil((expires - Date.now()) / 86_400_000);
  return Math.max(0, days);
}

function DaysBadge({ days }: { days: number | null }) {
  if (days === null) {
    return <span className="text-disabled">—</span>;
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
  const purgeTask = usePurgeTask();
  const purgePlan = usePurgePlan();
  const purgeGroup = usePurgeGroup();
  const [confirmingPurge, setConfirmingPurge] = useState<TrashItem | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TrashStatus | null>(null);
  const [typeFilter, setTypeFilter] = useState<TrashKind | null>(null);
  const isPurging = purgeTask.isPending || purgePlan.isPending || purgeGroup.isPending;
  const closePurgeDialog = () => {
    if (!isPurging) setConfirmingPurge(null);
  };

  function onConfirmPurge() {
    if (!confirmingPurge || isPurging) return;
    if (confirmingPurge.kind === 'task') {
      purgeTask.mutate({ task_id: confirmingPurge.id }, { onSuccess: closePurgeDialog });
    } else if (confirmingPurge.kind === 'plan') {
      purgePlan.mutate({ plan_id: confirmingPurge.id }, { onSuccess: closePurgeDialog });
    } else if (confirmingPurge.kind === 'group') {
      purgeGroup.mutate({ group_id: confirmingPurge.id }, { onSuccess: closePurgeDialog });
    }
  }

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

  // One list for the whole screen: deleted groups/plans/tasks first, then archived plans.
  const items: TrashItem[] = [
    ...q.data.groups.map(
      (g): TrashItem => ({
        rowKey: `deleted:group:${g.id}`,
        status: 'deleted',
        kind: 'group',
        id: g.id,
        name: g.name,
        date: g.deleted_at,
      }),
    ),
    ...q.data.plans.map(
      (p): TrashItem => ({
        rowKey: `deleted:plan:${p.id}`,
        status: 'deleted',
        kind: 'plan',
        id: p.id,
        name: p.name,
        date: p.deleted_at,
        group_id: p.group_id,
      }),
    ),
    ...q.data.tasks.map(
      (t): TrashItem => ({
        rowKey: `deleted:task:${t.id}`,
        status: 'deleted',
        kind: 'task',
        id: t.id,
        name: t.title,
        date: t.deleted_at,
        plan_id: t.plan_id,
      }),
    ),
    ...q.data.archivedPlans.map(
      (p): TrashItem => ({
        rowKey: `archived:plan:${p.id}`,
        status: 'archived',
        kind: 'plan',
        id: p.id,
        name: p.name,
        date: p.archived_at,
        group_id: p.group_id,
        version: p.version,
      }),
    ),
  ];

  const query = search.trim().toLowerCase();
  const filtered = items.filter((it) => {
    if (statusFilter && it.status !== statusFilter) return false;
    if (typeFilter && it.kind !== typeFilter) return false;
    if (query && !it.name.toLowerCase().includes(query)) return false;
    return true;
  });
  const clearFilters = () => {
    setSearch('');
    setStatusFilter(null);
    setTypeFilter(null);
  };

  function onRestore(it: TrashItem) {
    if (it.status === 'archived') {
      unarchivePlan.mutate({ plan_id: it.id });
      return;
    }
    if (it.kind === 'task') {
      if (it.plan_id && trashedPlanIds.has(it.plan_id)) {
        const confirmed = window.confirm(
          "This task's plan was deleted too. Restore the plan first?",
        );
        if (!confirmed) return;
        restorePlan.mutate({ plan_id: it.plan_id });
      }
      restoreTask.mutate({ task_id: it.id });
    }
    if (it.kind === 'plan') restorePlan.mutate({ plan_id: it.id });
    if (it.kind === 'group') restoreGroup.mutate({ group_id: it.id });
  }

  function onDelete(it: TrashItem) {
    if (it.status === 'archived') {
      deleteArchivedPlan.mutate({ plan_id: it.id, expected_version: it.version ?? 0 });
      return;
    }
    setConfirmingPurge(it);
  }

  // Restore/Delete gates differ by status: deleted items restore per their kind's update permission
  // and purge behind canPermanentlyDelete; archived plans use the plan update/delete permissions.
  function restorePerm(it: TrashItem) {
    return it.status === 'archived'
      ? { allowed: canUpdatePlan, reason: PERMISSION_DENIED.plan.restore }
      : restoreGate[it.kind];
  }
  function deletePerm(it: TrashItem) {
    return it.status === 'archived'
      ? { allowed: canDeletePlan, reason: PERMISSION_DENIED.plan.delete }
      : { allowed: canPermanentlyDelete, reason: PERMISSION_DENIED.trash.permanentDelete };
  }

  const columns: TableColumn<TrashItem>[] = [
    {
      key: 'type',
      header: 'Type',
      width: pixel(104),
      renderCell: (it) => {
        const meta = KIND_META[it.kind];
        const Icon = meta.Icon;
        return (
          <span className="flex items-center gap-2 text-secondary">
            <Icon className={`size-3.5 shrink-0 ${meta.iconClass}`} aria-hidden />
            <span className="text-xs">{meta.label}</span>
          </span>
        );
      },
    },
    {
      key: 'name',
      header: 'Name',
      width: proportional(2.4, { minWidth: 220 }),
      renderCell: (it) => <span className="truncate font-medium text-primary">{it.name}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: pixel(128),
      renderCell: (it) => {
        const s = STATUS_META[it.status];
        return <Badge variant={s.variant} label={s.label} />;
      },
    },
    {
      key: 'when',
      header: 'When',
      width: pixel(140),
      renderCell: (it) => (
        <span className="text-secondary" suppressHydrationWarning>
          {it.date ? formatRelative(it.date) : '—'}
        </span>
      ),
    },
    {
      key: 'retention',
      header: 'Retention',
      width: pixel(120),
      // Archived plans are kept until deleted, so retention only applies to deleted items.
      renderCell: (it) =>
        it.status === 'deleted' ? (
          <DaysBadge days={daysRemaining(it.date)} />
        ) : (
          <span className="text-disabled">—</span>
        ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: pixel(72),
      align: 'end',
      renderCell: (it) => {
        const rp = restorePerm(it);
        const dp = deletePerm(it);
        // Deleting an already-deleted item purges it for good; archived plans just move to Deleted.
        const deleteLabel = it.status === 'deleted' ? 'Delete forever' : 'Delete';
        return (
          <div className="flex justify-end">
            <DropdownMenu
              placement="below"
              button={{
                isIconOnly: true,
                icon: <MoreHorizontal className="size-4" />,
                variant: 'ghost',
                size: 'sm',
                label: `Actions for ${it.name}`,
              }}
            >
              <DropdownMenuItem
                label="Restore"
                isDisabled={!rp.allowed}
                onClick={() => onRestore(it)}
              />
              <DropdownMenuItem
                label={deleteLabel}
                style={{ color: 'var(--color-error)' }}
                isDisabled={!dp.allowed}
                onClick={() => onDelete(it)}
              />
            </DropdownMenu>
          </div>
        );
      },
    },
  ];

  return (
    <Layout
      height="fill"
      header={
        <>
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
          {items.length > 0 && (
            <LayoutHeader padding={0}>
              <Toolbar
                label="Trash filters"
                size="sm"
                dividers={['bottom']}
                startContent={
                  <>
                    <Input
                      type="text"
                      label="Search trash"
                      isLabelHidden
                      startIcon={<Search className="size-3.5" aria-hidden />}
                      hasClear
                      placeholder="Search by name…"
                      value={search}
                      onChange={setSearch}
                      className="w-[260px]"
                      size="sm"
                    />
                    <Selector
                      label="Status"
                      isLabelHidden
                      size="sm"
                      placeholder="Status"
                      hasClear
                      options={STATUS_OPTIONS}
                      value={statusFilter}
                      onChange={(v) => setStatusFilter(v as TrashStatus | null)}
                    />
                    <Selector
                      label="Type"
                      isLabelHidden
                      size="sm"
                      placeholder="Type"
                      hasClear
                      options={TYPE_OPTIONS}
                      value={typeFilter}
                      onChange={(v) => setTypeFilter(v as TrashKind | null)}
                    />
                  </>
                }
              />
            </LayoutHeader>
          )}
        </>
      }
      content={
        <LayoutContent padding={0}>
          <div className="flex h-full flex-col">
            <div className="flex-1 overflow-auto">
              {items.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={<Trash2 className="size-6" />}
                    title="Trash is empty"
                    description={`Deleted items stay here for ${RETENTION_DAYS} days before they're gone for good; archived plans are kept until you delete them.`}
                  />
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={<Search className="size-6" />}
                    title="No matching items"
                    description="Try a different search, or clear the status and type filters."
                    actions={<Button label="Clear filters" onClick={clearFilters} />}
                  />
                </div>
              ) : (
                <Table
                  data={filtered}
                  columns={columns}
                  idKey="rowKey"
                  density="compact"
                  aria-label="Trash"
                />
              )}
            </div>
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
                <DialogFooter>
                  <Button
                    variant="ghost"
                    label="Cancel"
                    isDisabled={isPurging}
                    onClick={closePurgeDialog}
                  />
                  <Button
                    variant="destructive"
                    label="Permanently delete"
                    isDisabled={isPurging}
                    isLoading={isPurging}
                    onClick={onConfirmPurge}
                  />
                </DialogFooter>
              }
            />
          </Dialog>
        </LayoutContent>
      }
    />
  );
}
