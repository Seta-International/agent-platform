import { Button, EmptyState, Skeleton } from '@seta/shared-ui';
import { useState } from 'react';
import { useRestoreGroup } from '../hooks/mutations/restore-group';
import { useRestorePlan } from '../hooks/mutations/restore-plan';
import { useRestoreTask } from '../hooks/mutations/restore-task';
import { useTrash } from '../hooks/queries/use-trash';

type TrashRow =
  | { kind: 'group'; id: string; name: string; deleted_at: string | null }
  | { kind: 'plan'; id: string; name: string; deleted_at: string | null; group_id?: string }
  | { kind: 'task'; id: string; name: string; deleted_at: string | null; plan_id?: string };

const RETENTION_DAYS = 30;

function daysRemaining(deletedAt: string | null): number | null {
  if (!deletedAt) return null;
  const expires = new Date(deletedAt).getTime() + RETENTION_DAYS * 86_400_000;
  const days = Math.ceil((expires - Date.now()) / 86_400_000);
  return Math.max(0, days);
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
  const [confirmingPurge, setConfirmingPurge] = useState<TrashRow | null>(null);

  if (q.isPending) {
    return <Skeleton data-testid="skeleton-trash" className="m-6 h-24 w-full" />;
  }
  if (q.isError) {
    return (
      <div role="alert" className="m-6">
        Couldn't load trash.
      </div>
    );
  }

  const trashedPlanIds = new Set(q.data.plans.map((p) => p.id));

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

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Trash is empty"
        description={`Deleted groups, plans, and tasks land here for ${RETENTION_DAYS} days before permanent removal.`}
      />
    );
  }

  function onRestore(r: TrashRow) {
    if (r.kind === 'task') {
      if (r.plan_id && trashedPlanIds.has(r.plan_id)) {
        const confirmed = window.confirm(
          'This task belongs to a deleted plan. Restore the plan first?',
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
    <div className="p-6">
      <h1 className="text-display-md text-ink mb-4">Trash</h1>
      <table className="w-full text-left text-body-sm">
        <thead className="text-ink-subtle">
          <tr>
            <th className="py-2 pr-4">Type</th>
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Deleted</th>
            <th className="py-2 pr-4">Days remaining</th>
            <th className="py-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const days = daysRemaining(r.deleted_at);
            return (
              <tr key={`${r.kind}:${r.id}`} className="border-t border-surface-3">
                <td className="py-2 pr-4">{r.kind}</td>
                <td className="py-2 pr-4">{r.name}</td>
                <td className="py-2 pr-4">
                  {r.deleted_at ? new Date(r.deleted_at).toLocaleDateString() : ''}
                </td>
                <td className="py-2 pr-4">
                  {days === null ? '—' : days === 0 ? 'Expiring' : `${days}d`}
                </td>
                <td className="py-2">
                  <Button variant="ghost" size="sm" onClick={() => onRestore(r)}>
                    Restore
                  </Button>
                  {canPermanentlyDelete && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-2 text-semantic-danger"
                      onClick={() => setConfirmingPurge(r)}
                    >
                      Permanently delete
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {confirmingPurge && (
        <div
          role="alertdialog"
          aria-labelledby="purge-title"
          className="mt-4 rounded-md border border-semantic-danger bg-semantic-danger-tint p-4"
        >
          <h2 id="purge-title" className="font-medium">
            Permanently delete "{confirmingPurge.name}"?
          </h2>
          <p className="mt-1 text-body-sm text-ink-subtle">This cannot be undone.</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirmingPurge(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-semantic-danger text-white"
              onClick={() => {
                // The backend's hard-delete endpoint is policy-driven (RETENTION_DAYS sweep, not
                // a manual API); this dialog confirms intent until that endpoint lands.
                setConfirmingPurge(null);
              }}
            >
              Permanently delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
