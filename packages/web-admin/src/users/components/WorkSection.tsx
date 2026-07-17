import {
  Button,
  createStaticSource,
  Input,
  NumberInput,
  type SearchableItem,
  type SearchSource,
  Skeleton,
  Typeahead,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { Briefcase, FolderKanban, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
  const [account, setAccount] = useState<SearchableItem | null>(null);
  const [project, setProject] = useState<SearchableItem | null>(null);
  const [pct, setPct] = useState('100');

  const accountId = account?.id ?? null;

  // Selections always come from live search results, so there are never unknown ids to hydrate.
  const accountSource: SearchSource<SearchableItem> = useMemo(
    () => ({
      search: async (q) => (await searchAccounts(q)).map((r) => ({ id: r.id, label: r.name })),
      bootstrap: async () => (await searchAccounts('')).map((r) => ({ id: r.id, label: r.name })),
    }),
    [],
  );
  const projectSource: SearchSource<SearchableItem> = useMemo(() => {
    const load = async (q: string) => {
      if (!accountId) return [];
      const rows = await searchProjects(q, accountId);
      return rows
        .filter((r) => !allocatedProjectIds.has(r.id))
        .map((r) => ({ id: r.id, label: r.name }));
    };
    return { search: load, bootstrap: () => load('') };
  }, [accountId, allocatedProjectIds]);

  const submit = () => {
    if (!project) return;
    const parsed = pct.trim() === '' ? null : Math.min(100, Math.max(0, Number(pct)));
    onSubmit(
      {
        project_id: project.id,
        planned_pct: parsed !== null && Number.isFinite(parsed) ? parsed : null,
      },
      // Keep the account so several projects can be added under it in a row.
      () => {
        setProject(null);
        setPct('100');
      },
    );
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
      <Field label="Account">
        <Typeahead
          label="Account"
          isLabelHidden
          searchSource={accountSource}
          hasEntriesOnFocus
          value={account}
          onChange={(item) => {
            setAccount(item);
            setProject(null);
          }}
          placeholder="Select account…"
        />
      </Field>
      <Field label="Project">
        <Typeahead
          key={accountId ?? 'none'}
          label="Project"
          isLabelHidden
          searchSource={projectSource}
          hasEntriesOnFocus
          value={project}
          onChange={setProject}
          isDisabled={!accountId}
          placeholder={accountId ? 'Select project…' : 'Pick an account first'}
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
        <Button size="sm" label="Add" isDisabled={!project || pending} onClick={submit} />
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
  const orgUnitItems = useMemo<SearchableItem[]>(
    () => orgUnits.map((u) => ({ id: u.id, label: u.name })),
    [orgUnits],
  );
  const orgUnitSource = useMemo(() => createStaticSource(orgUnitItems), [orgUnitItems]);
  const orgUnitValue = useMemo(
    () => orgUnitItems.find((u) => u.id === profile?.org_unit_id) ?? null,
    [orgUnitItems, profile?.org_unit_id],
  );

  if (profileError) {
    return (
      <div className="flex flex-col gap-4">
        <SectionTitle icon={<Briefcase className="size-4" />}>Work</SectionTitle>
        <p className="text-base text-disabled">Couldn't load the work profile.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle icon={<Briefcase className="size-4" />}>Work</SectionTitle>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Position"
          value={title}
          onChange={(value) => setTitle(value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          isDisabled={!workerEditable || !profile}
          placeholder="Job title…"
          size="sm"
        />
        <Field label="Department">
          <Typeahead
            label="Department"
            isLabelHidden
            searchSource={orgUnitSource}
            debounceMs={0}
            hasEntriesOnFocus
            value={orgUnitValue}
            onChange={(item) => {
              if (!profile) return;
              editWorker.mutate({
                expectedVersion: profile.version,
                patch: { org_unit_id: item?.id ?? null },
              });
            }}
            isDisabled={!workerEditable || !profile}
            placeholder="No department"
          />
        </Field>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex h-6 items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-[0.04em] text-secondary">
            Accounts · projects
          </span>
          {allocationsEditable && !adding && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-1.5 text-secondary"
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
            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-base text-disabled">
              No project allocations
            </p>
          )
        ) : (
          <div className="flex flex-col gap-1.5">
            {groups.map((group) => {
              const total = allocationTotal(group.rows);
              return (
                <div key={group.id} className="rounded-lg border border-border bg-card">
                  <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
                    <span className="truncate text-sm font-semibold uppercase tracking-[0.04em] text-secondary">
                      {group.name}
                    </span>
                    {total !== null && (
                      <span className="flex-none text-sm tabular-nums text-secondary">
                        {total}% total
                      </span>
                    )}
                  </div>
                  <ul className="flex flex-col">
                    {group.rows.map((a) => (
                      <li
                        key={a.allocation_id}
                        className="flex items-center gap-2.5 border-b border-border px-3 py-2 last:border-b-0"
                      >
                        <FolderKanban className="size-4 flex-none text-secondary" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <span className="block truncate text-base font-medium text-primary">
                            {a.project_name}
                          </span>
                          {(a.role || a.status !== 'committed') && (
                            <span className="block truncate text-sm text-secondary">
                              {[a.role, a.status !== 'committed' ? a.status : null]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          )}
                        </div>
                        {a.planned_pct !== null && (
                          <span className="flex-none text-base tabular-nums text-secondary">
                            {a.planned_pct}%
                          </span>
                        )}
                        {allocationsEditable && (
                          <Button
                            variant="ghost"
                            size="sm"
                            isIconOnly
                            className="size-6 flex-none text-secondary hover:text-error"
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
