import {
  Button,
  createStaticSource,
  Grid,
  HStack,
  IconButton,
  Input,
  List,
  ListItem,
  NumberInput,
  type SearchableItem,
  type SearchSource,
  Skeleton,
  Text,
  Typeahead,
  VStack,
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
    <VStack
      gap={3}
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-container)',
        padding: 'var(--spacing-3)',
      }}
    >
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
      <HStack hAlign="end" gap={2}>
        <Button variant="ghost" size="sm" label="Cancel" onClick={onCancel} />
        <Button
          size="sm"
          variant="primary"
          icon={<Plus className="size-3.5" />}
          label="Add"
          isDisabled={!project || pending}
          onClick={submit}
        />
      </HStack>
    </VStack>
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
      <VStack gap={4}>
        <SectionTitle icon={<Briefcase className="size-4" />}>Work</SectionTitle>
        <Text color="disabled" display="block">
          Couldn&apos;t load the work profile.
        </Text>
      </VStack>
    );
  }

  return (
    <VStack gap={4}>
      <SectionTitle icon={<Briefcase className="size-4" />}>Work</SectionTitle>

      <Grid columns={2} gap={4}>
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
      </Grid>

      <VStack gap={2}>
        <HStack hAlign="between" vAlign="center" style={{ height: 'var(--spacing-6)' }}>
          <Text type="supporting" weight="medium" color="secondary">
            Accounts · projects
          </Text>
          {allocationsEditable && !adding && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAdding(true)}
              icon={<Plus className="size-3.5" aria-hidden />}
              label="Add project"
              style={{ color: 'var(--color-text-secondary)' }}
            />
          )}
        </HStack>

        {adding && (
          <AddAllocationForm
            allocatedProjectIds={allocatedProjectIds}
            pending={addAllocation.isPending}
            onSubmit={(input, reset) => addAllocation.mutate(input, { onSuccess: reset })}
            onCancel={() => setAdding(false)}
          />
        )}

        {allocationsLoading ? (
          <VStack gap={1.5}>
            <Skeleton height={56} radius={3} />
            <Skeleton height={56} radius={3} />
          </VStack>
        ) : groups.length === 0 ? (
          !adding && (
            <VStack
              vAlign="center"
              style={{
                border: '1px dashed var(--color-border)',
                borderRadius: 'var(--radius-container)',
                padding: 'var(--spacing-4) var(--spacing-3)',
              }}
            >
              <Text color="disabled" justify="center" display="block">
                No project allocations
              </Text>
            </VStack>
          )
        ) : (
          <VStack gap={1.5}>
            {groups.map((group) => {
              const total = allocationTotal(group.rows);
              return (
                // keep: bordered list container — Card's uniform padding would break the edge-to-edge List (same shape as GroupDetail's role-group container)
                <div
                  key={group.id}
                  style={{
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-container)',
                    overflow: 'hidden',
                  }}
                >
                  <HStack
                    hAlign="between"
                    vAlign="center"
                    gap={2}
                    style={{
                      padding: 'var(--spacing-1) var(--spacing-3)',
                      backgroundColor: 'var(--color-background-surface)',
                    }}
                  >
                    <Text type="supporting" weight="medium" color="secondary" className="truncate">
                      {group.name}
                    </Text>
                    {total !== null && (
                      <Text type="supporting" color="secondary" hasTabularNumbers>
                        {total}% total
                      </Text>
                    )}
                  </HStack>
                  <List hasDividers>
                    {group.rows.map((a) => (
                      <ListItem
                        key={a.allocation_id}
                        startContent={
                          <FolderKanban
                            className="size-4 flex-none"
                            style={{ color: 'var(--color-text-secondary)' }}
                            aria-hidden
                          />
                        }
                        label={a.project_name}
                        description={
                          a.role || a.status !== 'committed'
                            ? [a.role, a.status !== 'committed' ? a.status : null]
                                .filter(Boolean)
                                .join(' · ')
                            : undefined
                        }
                        endContent={
                          <HStack gap={2} vAlign="center">
                            {a.planned_pct !== null && (
                              <Text color="secondary" hasTabularNumbers>
                                {a.planned_pct}%
                              </Text>
                            )}
                            {allocationsEditable && (
                              <IconButton
                                variant="ghost"
                                size="sm"
                                label={`Remove ${a.project_name}`}
                                isDisabled={removeAllocation.isPending}
                                onClick={() => removeAllocation.mutate(a.allocation_id)}
                                icon={<X className="size-3.5" />}
                                style={{ color: 'var(--color-text-secondary)' }}
                                className="hover:text-error" // keep: no hover-state color prop on IconButton/Button
                              />
                            )}
                          </HStack>
                        }
                      />
                    ))}
                  </List>
                </div>
              );
            })}
          </VStack>
        )}
      </VStack>
    </VStack>
  );
}
