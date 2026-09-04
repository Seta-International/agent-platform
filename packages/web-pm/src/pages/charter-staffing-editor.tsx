import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  type AllocationRow,
  createAllocation,
  fetchProjectAccess,
  fetchProjectAllocations,
  type ProjectAccessRow,
  removeAllocation,
  setProjectAccess,
  updateAllocation,
} from '../api/pm-client.ts';
import { useWorkerSource } from '../api/worker-search';
import { pmKeys } from '../state/query-keys.ts';
import {
  Button,
  Card,
  CardTitle,
  Layout,
  LayoutContent,
  LayoutHeader,
  NumberInput,
  type SearchableItem,
  Selector,
  Typeahead,
  useSeededItems,
  useToast,
} from './_ui-compat.tsx';

const ROLES = ['Developer', 'Tech Lead', 'PM', 'QA', 'BA', 'PMO'] as const;
type AccessLevel = ProjectAccessRow['level'];

function LevelSelect({
  value,
  onChange,
  isLabelHidden = true,
}: {
  value: AccessLevel;
  onChange: (v: AccessLevel) => void;
  isLabelHidden?: boolean;
}) {
  return (
    <Selector
      label="Access"
      isLabelHidden={isLabelHidden}
      size="sm"
      options={[
        { value: 'owner', label: 'Owner' },
        { value: 'edit', label: 'Edit' },
        { value: 'view', label: 'View' },
      ]}
      value={value}
      onChange={(v) => onChange(v as AccessLevel)}
    />
  );
}

function RoleSelect({
  value,
  onChange,
  isLabelHidden = true,
}: {
  value: string;
  onChange: (v: string) => void;
  isLabelHidden?: boolean;
}) {
  return (
    <Selector
      label="Role"
      isLabelHidden={isLabelHidden}
      size="sm"
      options={ROLES.map((r) => ({ value: r, label: r }))}
      value={value}
      onChange={onChange}
    />
  );
}

const LEVEL_TONE: Record<AccessLevel, string> = {
  owner: 'var(--color-accent)',
  edit: 'var(--color-success)',
  view: 'var(--color-text-secondary)',
};

export function CharterStaffingEditor({
  projectId,
  dateFrom,
  dateTo,
  canManage,
}: {
  projectId: string;
  dateFrom: string | null;
  dateTo: string | null;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const workerSource = useWorkerSource({ excludeAlumni: true });
  const toast = useToast();

  const allocations = useQuery({
    queryKey: pmKeys.projectAllocations(projectId),
    queryFn: () => fetchProjectAllocations(projectId),
  });
  const access = useQuery({
    queryKey: pmKeys.projectAccess(projectId),
    queryFn: () => fetchProjectAccess(projectId),
  });

  const workerIds = useMemo(
    () => (allocations.data ?? []).map((a) => a.worker_id).filter((id): id is string => !!id),
    [allocations.data],
  );
  const [resolvedWorkers] = useSeededItems(workerIds, workerSource.seed);

  const nameOf = (id: string | null) =>
    (id && resolvedWorkers.find((o) => o.id === id)?.label) || id?.slice(0, 8) || '—';
  const levelOf = (id: string | null): AccessLevel | null =>
    (access.data?.find((g) => g.worker_id === id)?.level as AccessLevel | undefined) ?? null;

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: pmKeys.projectAllocations(projectId) });
    void queryClient.invalidateQueries({ queryKey: pmKeys.projectAccess(projectId) });
  }

  // ── add ────────────────────────────────────────────────────────────────
  const [worker, setWorker] = useState<SearchableItem | null>(null);
  const [role, setRole] = useState<string>('Developer');
  const [pct, setPct] = useState(100);
  const [level, setLevel] = useState<AccessLevel>('edit');

  const add = useMutation({
    mutationFn: async () => {
      if (!worker) throw new Error('No worker selected');
      await createAllocation({
        project_id: projectId,
        worker_id: worker.id,
        role,
        planned_pct: pct,
        date_from: dateFrom ?? new Date().toISOString().slice(0, 10),
        date_to: dateTo,
      });
      const next = (access.data ?? [])
        .filter((g) => g.worker_id !== worker.id)
        .concat({ worker_id: worker.id, level });
      await setProjectAccess(projectId, next);
    },
    onSuccess: () => {
      toast({ body: 'Staffed & access granted' });
      setWorker(null);
      setRole('Developer');
      setPct(100);
      setLevel('edit');
      invalidate();
    },
    onError: (e: Error) => toast({ body: e.message, type: 'error' }),
  });

  // ── inline edit ──────────────────────────────────────────────────────────
  const [editId, setEditId] = useState<string | null>(null);
  const [draftRole, setDraftRole] = useState('Developer');
  const [draftPct, setDraftPct] = useState(100);
  const [draftLevel, setDraftLevel] = useState<AccessLevel>('edit');

  const startEdit = (a: AllocationRow) => {
    setEditId(a.allocation_id);
    setDraftRole(a.role ?? 'Developer');
    setDraftPct(a.planned_pct ?? 100);
    setDraftLevel(levelOf(a.worker_id) ?? 'edit');
  };

  const save = useMutation({
    mutationFn: async (a: AllocationRow) => {
      await updateAllocation(a.allocation_id, { role: draftRole, planned_pct: draftPct });
      if (a.worker_id && draftLevel !== levelOf(a.worker_id)) {
        const next = (access.data ?? [])
          .filter((g) => g.worker_id !== a.worker_id)
          .concat({ worker_id: a.worker_id, level: draftLevel });
        await setProjectAccess(projectId, next);
      }
    },
    onSuccess: () => {
      toast({ body: 'Member updated' });
      setEditId(null);
      invalidate();
    },
    onError: (e: Error) => toast({ body: e.message, type: 'error' }),
  });

  const remove = useMutation({
    mutationFn: async (a: AllocationRow) => {
      await removeAllocation(a.allocation_id);
      // Drop the access grant too — unless that would leave the project ownerless
      // (the backend rejects a zero-owner grant set), in which case keep it.
      if (a.worker_id) {
        const next = (access.data ?? []).filter((g) => g.worker_id !== a.worker_id);
        if (next.some((g) => g.level === 'owner')) await setProjectAccess(projectId, next);
      }
    },
    onSuccess: () => {
      toast({ body: 'Member removed' });
      invalidate();
    },
    onError: (e: Error) => toast({ body: e.message, type: 'error' }),
  });

  const rows = allocations.data ?? [];
  const busy = save.isPending || remove.isPending || add.isPending;
  const cols = canManage ? 5 : 4;

  return (
    <Card>
      <Layout
        header={
          <LayoutHeader hasDivider>
            <CardTitle>Staffing &amp; Access (R&amp;R)</CardTitle>
          </LayoutHeader>
        }
        content={
          <LayoutContent>
            <div className="space-y-4">
              <div className="overflow-hidden rounded-md border border-border">
                <table className="w-full text-base">
                  <thead>
                    <tr className="bg-surface text-left text-xs uppercase tracking-wide text-secondary">
                      <th className="px-3 py-2 font-medium">Member</th>
                      <th className="px-3 py-2 font-medium">Role</th>
                      <th className="px-3 py-2 text-center font-medium">RA %</th>
                      <th className="px-3 py-2 font-medium">Access</th>
                      {canManage && <th className="px-3 py-2" />}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((a) => {
                      const editing = editId === a.allocation_id;
                      const lvl = levelOf(a.worker_id);
                      return (
                        <tr key={a.allocation_id} className="border-t border-border align-middle">
                          <td className="px-3 py-2 font-medium text-primary">
                            {nameOf(a.worker_id)}
                          </td>
                          <td className="px-3 py-2">
                            {editing ? (
                              <div className="w-36">
                                <RoleSelect value={draftRole} onChange={setDraftRole} />
                              </div>
                            ) : (
                              (a.role ?? '—')
                            )}
                          </td>
                          <td className="px-3 py-2 text-center font-mono">
                            {editing ? (
                              <NumberInput
                                label="RA %"
                                isLabelHidden
                                min={0}
                                max={100}
                                units="%"
                                width={80}
                                value={draftPct}
                                onChange={(v) => setDraftPct(v)}
                                className="mx-auto"
                              />
                            ) : (
                              `${a.planned_pct ?? '—'}%`
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {editing ? (
                              <div className="w-28">
                                <LevelSelect value={draftLevel} onChange={setDraftLevel} />
                              </div>
                            ) : (
                              <span
                                className="font-medium capitalize"
                                style={lvl ? { color: LEVEL_TONE[lvl] } : undefined}
                              >
                                {lvl ?? '—'}
                              </span>
                            )}
                          </td>
                          {canManage && (
                            <td className="px-3 py-2">
                              <div className="flex justify-end gap-1">
                                {editing ? (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      isIconOnly
                                      label="Save"
                                      isDisabled={save.isPending}
                                      onClick={() => save.mutate(a)}
                                      icon={
                                        <Check className="size-4 text-[var(--color-success)]" />
                                      }
                                    />
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      isIconOnly
                                      label="Cancel"
                                      onClick={() => setEditId(null)}
                                      icon={<X className="size-4" />}
                                    />
                                  </>
                                ) : (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      isIconOnly
                                      label="Edit member"
                                      isDisabled={busy}
                                      onClick={() => startEdit(a)}
                                      icon={<Pencil className="size-4" />}
                                    />
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      isIconOnly
                                      label="Remove member"
                                      isDisabled={busy}
                                      onClick={() => remove.mutate(a)}
                                      icon={<Trash2 className="size-4 text-[var(--color-error)]" />}
                                    />
                                  </>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={cols} className="px-3 py-4 text-center text-secondary">
                          No one staffed yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {canManage && (
                <div className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
                  <div className="min-w-[200px] flex-1 space-y-1">
                    <Typeahead
                      label="Add member"
                      searchSource={workerSource.source}
                      value={worker}
                      onChange={setWorker}
                      placeholder="Search workers…"
                    />
                  </div>
                  <div className="w-36 space-y-1">
                    <RoleSelect value={role} onChange={setRole} isLabelHidden={false} />
                  </div>
                  <NumberInput
                    label="RA %"
                    min={0}
                    max={100}
                    units="%"
                    width={96}
                    value={pct}
                    onChange={(v) => setPct(v)}
                  />
                  <div className="w-28 space-y-1">
                    <LevelSelect value={level} onChange={setLevel} isLabelHidden={false} />
                  </div>
                  <Button
                    variant="primary"
                    icon={<Plus className="size-4" />}
                    label={add.isPending ? 'Adding…' : 'Add'}
                    onClick={() => add.mutate()}
                    isDisabled={!worker || add.isPending}
                  />
                </div>
              )}
            </div>
          </LayoutContent>
        }
      />
    </Card>
  );
}
