import {
  AsyncCombobox,
  Button,
  Combobox,
  type EntityOption,
  Input,
  NumberInput,
  Skeleton,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { Briefcase, FolderKanban, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { searchAccounts, searchProjects, type WorkerAllocation } from '../api/work-client.ts';
import {
  useOrgUnits,
  useWorkerAllocations,
  useWorkerProfile,
  useWorkMutations,
} from '../hooks/useWork.ts';
import { Field, SectionTitle } from './sheet-primitives.tsx';

interface Props {
  /** person_id — workers are keyed by person. */
  workerId: string;
  employmentStatus: 'active' | 'terminated';
}

/** Allocations grouped under their client account so the drawer reads account → projects. */
function groupByAccount(allocations: WorkerAllocation[]) {
  const map = new Map<string, { id: string; name: string; rows: WorkerAllocation[] }>();
  for (const a of allocations) {
    const group = map.get(a.account_id) ?? { id: a.account_id, name: a.account_name, rows: [] };
    group.rows.push(a);
    map.set(a.account_id, group);
  }
  return [...map.values()];
}

function allocationTotal(rows: WorkerAllocation[]): number | null {
  const pcts = rows.map((r) => r.planned_pct).filter((p): p is number => p !== null);
  return pcts.length > 0 ? pcts.reduce((sum, p) => sum + p, 0) : null;
}

function AddAllocationForm({
  allocatedProjectIds,
  pending,
  onSubmit,
  onCancel,
}: {
  allocatedProjectIds: Set<string>;
  pending: boolean;
  onSubmit: (input: { project_id: string; planned_pct: number | null }, reset: () => void) => void;
  onCancel: () => void;
}) {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [pct, setPct] = useState('100');

  const accountSearch = useCallback(
    async (q: string): Promise<EntityOption[]> =>
      (await searchAccounts(q)).map((r) => ({ value: r.id, label: r.name })),
    [],
  );
  const projectSearch = useCallback(
    async (q: string): Promise<EntityOption[]> => {
      if (!accountId) return [];
      const rows = await searchProjects(q, accountId);
      return rows
        .filter((r) => !allocatedProjectIds.has(r.id))
        .map((r) => ({ value: r.id, label: r.name }));
    },
    [accountId, allocatedProjectIds],
  );
  // Selections always come from live search results, so there are never unknown ids to hydrate.
  const resolveNone = useCallback(async (): Promise<EntityOption[]> => [], []);

  const submit = () => {
    if (!projectId) return;
    const parsed = pct.trim() === '' ? null : Math.min(100, Math.max(0, Number(pct)));
    onSubmit(
      {
        project_id: projectId,
        planned_pct: parsed !== null && Number.isFinite(parsed) ? parsed : null,
      },
      // Keep the account so several projects can be added under it in a row.
      () => {
        setProjectId(null);
        setPct('100');
      },
    );
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-hairline bg-surface-1 p-3">
      <Field label="Account">
        <AsyncCombobox
          value={accountId}
          onChange={(v) => {
            setAccountId(v);
            setProjectId(null);
          }}
          search={accountSearch}
          resolveByIds={resolveNone}
          placeholder="Select account…"
          aria-label="Account"
          modal
        />
      </Field>
      <Field label="Project">
        <AsyncCombobox
          key={accountId ?? 'none'}
          value={projectId}
          onChange={setProjectId}
          search={projectSearch}
          resolveByIds={resolveNone}
          disabled={!accountId}
          placeholder={accountId ? 'Select project…' : 'Pick an account first'}
          aria-label="Project"
          modal
        />
      </Field>
      <Field label="Allocation %">
        <NumberInput
          label="Allocation %"
          isLabelHidden
          min={0}
          max={100}
          units="%"
          width={96}
          value={pct === '' ? null : Number(pct)}
          onChange={(v) => setPct(String(v))}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" label="Cancel" onClick={onCancel} />
        <Button size="sm" label="Add" isDisabled={!projectId || pending} onClick={submit} />
      </div>
    </div>
  );
}

export function WorkSection({ workerId, employmentStatus }: Props) {
  const canEditWorker = usePermission('people.worker.update');
  const canManageAllocations = usePermission('pm.project.manage');
  const terminated = employmentStatus === 'terminated';
  const workerEditable = canEditWorker && !terminated;
  const allocationsEditable = canManageAllocations && !terminated;

  const { data: profile, isError: profileError } = useWorkerProfile(workerId);
  const { data: allocations = [], isLoading: allocationsLoading } = useWorkerAllocations(workerId);
  const { data: orgUnits = [] } = useOrgUnits();
  const { editWorker, addAllocation, removeAllocation } = useWorkMutations(workerId);

  const [title, setTitle] = useState('');
  useEffect(() => setTitle(profile?.job_title ?? ''), [profile?.job_title]);

  const [adding, setAdding] = useState(false);

  const commitTitle = () => {
    if (!profile) return;
    const next = title.trim();
    if (next === (profile.job_title ?? '')) return;
    editWorker.mutate({
      expectedVersion: profile.version,
      patch: { job_title: next || null },
    });
  };

  const groups = useMemo(() => groupByAccount(allocations), [allocations]);
  const allocatedProjectIds = useMemo(
    () => new Set(allocations.map((a) => a.project_id)),
    [allocations],
  );
  const orgUnitOptions = useMemo(
    () => orgUnits.map((u) => ({ value: u.id, label: u.name })),
    [orgUnits],
  );

  if (profileError) {
    return (
      <div className="flex flex-col gap-4">
        <SectionTitle icon={<Briefcase className="size-4" />}>Work</SectionTitle>
        <p className="text-body-sm text-ink-tertiary">Couldn't load the work profile.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle icon={<Briefcase className="size-4" />}>Work</SectionTitle>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Position">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            disabled={!workerEditable || !profile}
            placeholder="Job title…"
            className="h-8 text-body-sm"
            aria-label="Job title"
          />
        </Field>
        <Field label="Department">
          <Combobox
            value={profile?.org_unit_id ?? null}
            onChange={(v) => {
              if (!profile) return;
              editWorker.mutate({
                expectedVersion: profile.version,
                patch: { org_unit_id: v },
              });
            }}
            options={orgUnitOptions}
            disabled={!workerEditable || !profile}
            placeholder="No department"
            searchPlaceholder="Search departments…"
            aria-label="Department"
            modal
          />
        </Field>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex h-6 items-center justify-between">
          <span className="text-eyebrow uppercase tracking-[0.04em] text-ink-subtle">
            Accounts · projects
          </span>
          {allocationsEditable && !adding && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-1.5 text-ink-subtle"
              onClick={() => setAdding(true)}
              icon={<Plus className="size-3.5" aria-hidden />}
              label="Add project"
            />
          )}
        </div>

        {adding && (
          <AddAllocationForm
            allocatedProjectIds={allocatedProjectIds}
            pending={addAllocation.isPending}
            onSubmit={(input, reset) => addAllocation.mutate(input, { onSuccess: reset })}
            onCancel={() => setAdding(false)}
          />
        )}

        {allocationsLoading ? (
          <div className="flex flex-col gap-1.5">
            <Skeleton height={56} radius={3} />
            <Skeleton height={56} radius={3} />
          </div>
        ) : groups.length === 0 ? (
          !adding && (
            <p className="rounded-lg border border-dashed border-hairline px-3 py-4 text-center text-body-sm text-ink-tertiary">
              No project allocations
            </p>
          )
        ) : (
          <div className="flex flex-col gap-1.5">
            {groups.map((group) => {
              const total = allocationTotal(group.rows);
              return (
                <div key={group.id} className="rounded-lg border border-hairline bg-surface-1">
                  <div className="flex items-center justify-between gap-2 border-b border-hairline px-3 py-1.5">
                    <span className="truncate text-caption font-semibold uppercase tracking-[0.04em] text-ink-subtle">
                      {group.name}
                    </span>
                    {total !== null && (
                      <span className="flex-none text-caption tabular-nums text-ink-subtle">
                        {total}% total
                      </span>
                    )}
                  </div>
                  <ul className="flex flex-col">
                    {group.rows.map((a) => (
                      <li
                        key={a.allocation_id}
                        className="flex items-center gap-2.5 border-b border-hairline px-3 py-2 last:border-b-0"
                      >
                        <FolderKanban className="size-4 flex-none text-ink-subtle" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <span className="block truncate text-body-sm font-medium text-ink">
                            {a.project_name}
                          </span>
                          {(a.role || a.status !== 'committed') && (
                            <span className="block truncate text-caption text-ink-subtle">
                              {[a.role, a.status !== 'committed' ? a.status : null]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          )}
                        </div>
                        {a.planned_pct !== null && (
                          <span className="flex-none text-body-sm tabular-nums text-ink-subtle">
                            {a.planned_pct}%
                          </span>
                        )}
                        {allocationsEditable && (
                          <Button
                            variant="ghost"
                            size="sm"
                            isIconOnly
                            className="size-6 flex-none text-ink-subtle hover:text-destructive"
                            label={`Remove ${a.project_name}`}
                            isDisabled={removeAllocation.isPending}
                            onClick={() => removeAllocation.mutate(a.allocation_id)}
                            icon={<X className="size-3.5" />}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
