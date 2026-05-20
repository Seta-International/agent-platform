import { Button, EmptyState, Skeleton } from '@seta/shared-ui';
import { useRestoreGroup } from '../hooks/mutations/restore-group';
import { useRestorePlan } from '../hooks/mutations/restore-plan';
import { useRestoreTask } from '../hooks/mutations/restore-task';
import { useTrash } from '../hooks/queries/use-trash';

type TrashRow =
  | { kind: 'group'; id: string; name: string; deleted_at: string | null }
  | { kind: 'plan'; id: string; name: string; deleted_at: string | null }
  | { kind: 'task'; id: string; name: string; deleted_at: string | null };

export function TrashPage() {
  const q = useTrash();
  const restoreTask = useRestoreTask();
  const restoreGroup = useRestoreGroup();
  const restorePlan = useRestorePlan();

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
    })),
    ...q.data.tasks.map((t) => ({
      kind: 'task' as const,
      id: t.id,
      name: t.title,
      deleted_at: t.deleted_at,
    })),
  ];

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Trash is empty"
        description="Deleted groups, plans, and tasks land here for 30 days before permanent removal."
      />
    );
  }

  function onRestore(r: TrashRow) {
    if (r.kind === 'task') restoreTask.mutate({ task_id: r.id });
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
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.kind}:${r.id}`} className="border-t border-surface-3">
              <td className="py-2 pr-4">{r.kind}</td>
              <td className="py-2 pr-4">{r.name}</td>
              <td className="py-2 pr-4">
                {r.deleted_at ? new Date(r.deleted_at).toLocaleDateString() : ''}
              </td>
              <td className="py-2">
                <Button variant="ghost" size="sm" onClick={() => onRestore(r)}>
                  Restore
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
