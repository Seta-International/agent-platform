import {
  Avatar,
  Badge,
  Banner,
  BreadcrumbItem,
  Breadcrumbs,
  Button,
  Card,
  CardTitle,
  DateInput,
  EmptyState,
  formatRelative,
  HStack,
  IconButton,
  Input,
  Layout,
  LayoutContent,
  LayoutHeader,
  PageContainer,
  type SearchableItem,
  Selector,
  Skeleton,
  SkillLevelRating,
  Text,
  Typeahead,
  useSeededItem,
  useToast,
  VStack,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { Clock, Search, X } from 'lucide-react';
import { useState } from 'react';
import { searchOrgUnits } from '../api/org-client.ts';
import {
  addWorkerSkill,
  editWorker,
  fetchWorker,
  fetchWorkerHistory,
  GENDER_OPTIONS,
  genderLabel,
  getWorkerCvDownloadUrl,
  putToS3,
  removeWorkerSkill,
  requestWorkerCvUpload,
  searchSkills,
  setWorkerSkillLevel,
  type WorkerDetail,
  type WorkerPatch,
} from '../api/people-client.ts';
import { peopleKeys } from '../state/query-keys.ts';

function LifecycleBadge({ stage }: { stage: string | null }) {
  const variantMap: Record<string, 'neutral' | 'error'> = {
    active: 'neutral',
    onboarding: 'neutral',
    offboarding: 'neutral',
    terminated: 'error',
    leave: 'neutral',
  };
  return (
    <Badge
      variant={(stage ? variantMap[stage] : undefined) ?? 'neutral'}
      className="capitalize"
      label={stage}
    />
  );
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 items-start py-2 border-b border-border last:border-0">
      <span className="text-base text-secondary font-medium">{label}</span>
      <span className="text-base text-primary break-all">{value ?? '—'}</span>
    </div>
  );
}

export function WorkerProfilePage() {
  const params = useParams({ strict: false });
  const workerId = params.workerId as string;
  const queryClient = useQueryClient();
  const toast = useToast();
  const canEdit = usePermission('people.worker.update');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<WorkerPatch>({});
  const [skillDraft, setSkillDraft] = useState<
    Array<{ id: string; name: string; level: number | null }>
  >([]);
  const [editError, setEditError] = useState<string | null>(null);

  // The draft only carries a persisted org_unit_id — resolve it into a labelled item while
  // editing (matched BY ID: searchOrgUnits.seed may not return the wanted unit first).
  const [orgUnitItem, setOrgUnitItem] = useSeededItem(
    editing ? (draft.org_unit_id ?? null) : null,
    searchOrgUnits.seed,
  );

  const {
    data: worker,
    isLoading: workerLoading,
    error: workerError,
  } = useQuery({
    queryKey: peopleKeys.worker(workerId),
    queryFn: () => fetchWorker(workerId),
  });

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: peopleKeys.history(workerId),
    queryFn: () => fetchWorkerHistory(workerId),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!worker) throw new Error('No worker data');
      const patch: WorkerPatch = {};
      if (draft.full_name !== undefined && draft.full_name !== worker.full_name)
        patch.full_name = draft.full_name;
      if (draft.work_email !== undefined && draft.work_email !== (worker.work_email ?? ''))
        patch.work_email = draft.work_email;
      if (draft.phone !== undefined && draft.phone !== (worker.phone ?? ''))
        patch.phone = draft.phone;
      if (draft.dob !== undefined && draft.dob !== (worker.dob ?? '')) patch.dob = draft.dob;
      if (draft.gender !== undefined && draft.gender !== (worker.gender ?? ''))
        patch.gender = draft.gender;
      if (
        draft.emergency_contact !== undefined &&
        draft.emergency_contact !== (worker.emergency_contact ?? '')
      )
        patch.emergency_contact = draft.emergency_contact;
      if (draft.job_title !== undefined && draft.job_title !== (worker.job_title ?? ''))
        patch.job_title = draft.job_title || null;
      if (draft.org_unit_id !== undefined && draft.org_unit_id !== (worker.org_unit_id ?? null))
        patch.org_unit_id = draft.org_unit_id;

      // Profile fields carry the optimistic-concurrency guard; only call when dirty.
      if (Object.keys(patch).length > 0) {
        await editWorker(workerId, { expected_version: worker.version, patch });
      }

      // Reconcile staged skill changes against the persisted set.
      const origById = new Map(worker.skills.map((s) => [s.id, s]));
      const draftById = new Map(skillDraft.map((s) => [s.id, s]));
      const removes = worker.skills.filter((s) => !draftById.has(s.id)).map((s) => s.id);
      const adds = skillDraft.filter((s) => !origById.has(s.id));
      const levelChanges = skillDraft.filter(
        (s) => origById.has(s.id) && origById.get(s.id)?.level !== s.level,
      );
      await Promise.all([
        ...removes.map((id) => removeWorkerSkill(workerId, id)),
        ...adds.map((s) => addWorkerSkill(workerId, s.id, s.level ?? undefined)),
        ...levelChanges.map((s) => setWorkerSkillLevel(workerId, s.id, s.level)),
      ]);
      if (draft.employee_no !== undefined && draft.employee_no !== (worker.employee_no ?? ''))
        patch.employee_no = draft.employee_no || null;
      return editWorker(workerId, { expected_version: worker.version, patch });
    },
    onSuccess: () => {
      toast({ body: 'Changes saved' });
      setEditing(false);
      setDraft({});
      setSkillDraft([]);
      setEditError(null);
      void queryClient.invalidateQueries({ queryKey: peopleKeys.worker(workerId) });
      void queryClient.invalidateQueries({ queryKey: peopleKeys.history(workerId) });
    },
    onError: (e: Error) => {
      if (e.message.includes('409') || e.message.toLowerCase().includes('conflict')) {
        setEditError('Another change was made while you were editing. Please refresh and retry.');
        void queryClient.invalidateQueries({ queryKey: peopleKeys.worker(workerId) });
      } else {
        setEditError(e.message);
      }
    },
  });

  // Skill edits stage into skillDraft and commit with the page's Save button. The typeahead
  // onChange already hands us the resolved item (id + label) — no need to re-resolve by id.
  function addSkillToDraft(item: SearchableItem) {
    setSkillDraft((prev) =>
      prev.some((s) => s.id === item.id)
        ? prev
        : [...prev, { id: item.id, name: item.label, level: null }],
    );
  }

  function removeSkillFromDraft(id: string) {
    setSkillDraft((prev) => prev.filter((s) => s.id !== id));
  }

  function rateSkillInDraft(id: string, level: number | null) {
    setSkillDraft((prev) => prev.map((s) => (s.id === id ? { ...s, level } : s)));
  }

  function startEdit() {
    if (!worker) return;
    setDraft({
      full_name: worker.full_name,
      work_email: worker.work_email ?? '',
      phone: worker.phone ?? '',
      dob: worker.dob ?? '',
      gender: worker.gender ?? '',
      emergency_contact: worker.emergency_contact ?? '',
      job_title: worker.job_title ?? '',
      org_unit_id: worker.org_unit_id ?? null,
      employee_no: worker.employee_no ?? '',
    });
    setSkillDraft(worker.skills.map((s) => ({ ...s })));
    setEditError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setDraft({});
    setSkillDraft([]);
    setEditError(null);
  }

  const headerActions =
    canEdit && !editing && worker ? (
      <Button size="sm" onClick={startEdit} label="Edit" />
    ) : canEdit && editing ? (
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={cancelEdit}
          isDisabled={saveMutation.isPending}
          label="Cancel"
        />
        <Button
          size="sm"
          variant="primary"
          onClick={() => saveMutation.mutate()}
          isDisabled={saveMutation.isPending}
          label={saveMutation.isPending ? 'Saving…' : 'Save'}
        />
      </div>
    ) : undefined;

  if (workerLoading) {
    return (
      <Layout
        height="fill"
        header={
          <LayoutHeader hasDivider padding={4}>
            <VStack gap={1}>
              <Breadcrumbs variant="supporting">
                <BreadcrumbItem href="/people">People</BreadcrumbItem>
                <BreadcrumbItem href="/people/employees">Employees</BreadcrumbItem>
                <BreadcrumbItem isCurrent>Profile</BreadcrumbItem>
              </Breadcrumbs>
              <HStack hAlign="between" vAlign="center" gap={2}>
                <HStack gap={2} vAlign="center">
                  <Text as="h1" size="lg" weight="semibold">
                    Profile
                  </Text>
                </HStack>
              </HStack>
            </VStack>
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={0}>
            <PageContainer className="space-y-4">
              <Card>
                <Layout
                  header={
                    <LayoutHeader hasDivider>
                      <div className="flex items-center gap-4">
                        <Skeleton height={56} width={56} radius="rounded" />
                        <div className="space-y-2">
                          <Skeleton height={20} width={160} />
                          <Skeleton height={16} width={96} />
                        </div>
                      </div>
                    </LayoutHeader>
                  }
                  content={
                    <LayoutContent>
                      <div className="space-y-3">
                        {Array.from({ length: 5 }).map((_, i) => (
                          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows are positional
                          <Skeleton key={i} height={16} />
                        ))}
                      </div>
                    </LayoutContent>
                  }
                />
              </Card>
            </PageContainer>
          </LayoutContent>
        }
      />
    );
  }

  if (workerError || !worker) {
    const msg = (workerError as Error | null)?.message ?? 'Worker not found';
    return (
      <Layout
        height="fill"
        header={
          <LayoutHeader hasDivider padding={4}>
            <VStack gap={1}>
              <Breadcrumbs variant="supporting">
                <BreadcrumbItem href="/people">People</BreadcrumbItem>
                <BreadcrumbItem href="/people/employees">Employees</BreadcrumbItem>
                <BreadcrumbItem isCurrent>Profile</BreadcrumbItem>
              </Breadcrumbs>
              <HStack hAlign="between" vAlign="center" gap={2}>
                <HStack gap={2} vAlign="center">
                  <Text as="h1" size="lg" weight="semibold">
                    Profile
                  </Text>
                </HStack>
              </HStack>
            </VStack>
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={0}>
            <PageContainer>
              <Banner status="error" title={msg} />
            </PageContainer>
          </LayoutContent>
        }
      />
    );
  }

  // In edit mode the Techstack renders the staged draft; otherwise the persisted set.
  const displaySkills = editing ? skillDraft : worker.skills;
  const currentSkillIds = displaySkills.map((s) => s.id);

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={1}>
            <Breadcrumbs variant="supporting">
              <BreadcrumbItem href="/people">People</BreadcrumbItem>
              <BreadcrumbItem href="/people/employees">Employees</BreadcrumbItem>
              <BreadcrumbItem isCurrent>{worker.full_name}</BreadcrumbItem>
            </Breadcrumbs>
            <HStack hAlign="between" vAlign="center" gap={2}>
              <HStack gap={2} vAlign="center">
                <Text as="h1" size="lg" weight="semibold">
                  {worker.full_name}
                </Text>
              </HStack>
              {headerActions}
            </HStack>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
          <PageContainer className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start">
            <div className="space-y-6">
              {/* Profile card */}
              <Card>
                <Layout
                  header={
                    <LayoutHeader hasDivider>
                      <div className="flex items-center gap-4">
                        {/* Name is spelled out beside the avatar, so Astryx's
                            name-on-hover tooltip would only duplicate it. */}
                        <Avatar
                          name={worker.full_name}
                          src={worker.photo_url ?? undefined}
                          size={60}
                          tooltip={false}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-2xl font-semibold truncate">
                              {worker.full_name}
                            </span>
                            <LifecycleBadge stage={worker.lifecycle_stage} />
                          </div>
                          <p className="text-base text-secondary truncate">
                            {worker.work_email || '—'}
                          </p>
                        </div>
                      </div>
                    </LayoutHeader>
                  }
                  content={
                    <LayoutContent>
                      {editError && <Banner status="error" className="mb-4" title={editError} />}

                      {editing ? (
                        <div className="space-y-4">
                          <div className="space-y-1">
                            <Input
                              label="Full name"
                              value={draft.full_name ?? ''}
                              onChange={(value) => setDraft((d) => ({ ...d, full_name: value }))}
                            />
                          </div>
                          <div className="space-y-1">
                            <Input
                              label="Employee number"
                              value={draft.employee_no ?? ''}
                              onChange={(value) => setDraft((d) => ({ ...d, employee_no: value }))}
                            />
                          </div>
                          <div className="space-y-1">
                            <Input
                              label="Job title"
                              value={draft.job_title ?? ''}
                              onChange={(value) => setDraft((d) => ({ ...d, job_title: value }))}
                            />
                          </div>
                          <div className="space-y-1">
                            <Typeahead
                              label="Org unit"
                              searchSource={searchOrgUnits.source}
                              hasEntriesOnFocus
                              value={orgUnitItem}
                              onChange={(item) => {
                                setOrgUnitItem(item);
                                setDraft((d) => ({ ...d, org_unit_id: item?.id ?? null }));
                              }}
                              placeholder="Search org units…"
                            />
                          </div>
                          <FieldRow label="Manager" value={worker.manager_name ?? '—'} />
                          <div className="space-y-1">
                            <Input
                              type="email"
                              label="Work email"
                              value={draft.work_email ?? ''}
                              onChange={(value) => setDraft((d) => ({ ...d, work_email: value }))}
                            />
                          </div>
                          <div className="space-y-1">
                            <Input
                              label="Phone"
                              value={draft.phone ?? ''}
                              onChange={(value) => setDraft((d) => ({ ...d, phone: value }))}
                            />
                          </div>
                          <div className="space-y-1">
                            <DateInput
                              label="Date of birth"
                              value={draft.dob || undefined}
                              onChange={(v) => setDraft((d) => ({ ...d, dob: v ?? '' }))}
                            />
                          </div>
                          <div className="space-y-1">
                            <Selector
                              label="Gender"
                              options={GENDER_OPTIONS.map((g) => ({
                                value: g.value,
                                label: g.label,
                              }))}
                              value={draft.gender || undefined}
                              onChange={(v) => setDraft((d) => ({ ...d, gender: v }))}
                              placeholder="Select…"
                            />
                          </div>
                          <div className="space-y-1">
                            <Input
                              label="Emergency contact"
                              value={draft.emergency_contact ?? ''}
                              onChange={(value) =>
                                setDraft((d) => ({ ...d, emergency_contact: value }))
                              }
                            />
                          </div>
                        </div>
                      ) : (
                        <div>
                          <FieldRow label="Full name" value={worker.full_name} />
                          <FieldRow label="Employee number" value={worker.employee_no} />
                          <FieldRow label="Job title" value={worker.job_title} />
                          <FieldRow label="Manager" value={worker.manager_name} />
                          <FieldRow label="Org unit" value={worker.org_unit_name} />
                          <FieldRow label="Work email" value={worker.work_email} />
                          <FieldRow label="Personal email" value={worker.personal_email} />
                          <FieldRow label="Phone" value={worker.phone} />
                          <FieldRow label="Date of birth" value={worker.dob} />
                          <FieldRow label="Gender" value={genderLabel(worker.gender)} />
                          <FieldRow label="Emergency contact" value={worker.emergency_contact} />
                          <FieldRow
                            label="Lifecycle stage"
                            value={<LifecycleBadge stage={worker.lifecycle_stage} />}
                          />
                          <FieldRow
                            label="CV"
                            value={<WorkerCvActions worker={worker} canEdit={canEdit} />}
                          />
                        </div>
                      )}
                    </LayoutContent>
                  }
                />
              </Card>

              {/* Techstack card */}
              <Card>
                <Layout
                  header={
                    <LayoutHeader hasDivider>
                      <CardTitle>Techstack</CardTitle>
                    </LayoutHeader>
                  }
                  content={
                    <LayoutContent>
                      {worker.skills.length === 0 && !editing ? (
                        <span className="text-base text-secondary">—</span>
                      ) : (
                        <div className="space-y-4">
                          {editing && (
                            <div className="flex items-center gap-2">
                              <Search className="size-4 shrink-0 text-secondary" />
                              <Typeahead
                                label="Add a skill"
                                isLabelHidden
                                searchSource={searchSkills.source}
                                value={null}
                                onChange={(item) => {
                                  if (item && !currentSkillIds.includes(item.id))
                                    addSkillToDraft(item);
                                }}
                                placeholder="Search to add a skill…"
                                className="flex-1"
                              />
                            </div>
                          )}
                          {displaySkills.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                              {displaySkills.map((s) => (
                                <div
                                  key={s.id}
                                  className="group flex flex-col gap-2 rounded-md border border-border bg-surface px-3 py-2.5 transition-colors hover:bg-surface"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-base font-medium text-primary truncate">
                                      {s.name}
                                    </span>
                                    {editing ? (
                                      <IconButton
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        label={`Remove ${s.name}`}
                                        icon={<X className="size-3.5" />}
                                        onClick={() => removeSkillFromDraft(s.id)}
                                        className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                                      />
                                    ) : (
                                      <span className="shrink-0 text-sm tabular-nums text-secondary">
                                        {s.level ? `${s.level}/5` : '—'}
                                      </span>
                                    )}
                                  </div>
                                  <SkillLevelRating
                                    level={s.level}
                                    onChange={
                                      editing ? (level) => rateSkillInDraft(s.id, level) : undefined
                                    }
                                  />
                                </div>
                              ))}
                            </div>
                          ) : (
                            editing && (
                              <p className="text-base text-secondary">
                                No skills yet — search above to add one.
                              </p>
                            )
                          )}
                          {editing && displaySkills.length > 0 && (
                            <p className="text-sm text-secondary">
                              Click a segment to rate proficiency · 1 = novice, 5 = expert · click
                              the active level to clear
                            </p>
                          )}
                        </div>
                      )}
                    </LayoutContent>
                  }
                />
              </Card>

              {/* Engagements card */}
              <Card>
                <Layout
                  header={
                    <LayoutHeader hasDivider>
                      <CardTitle>Engagements</CardTitle>
                    </LayoutHeader>
                  }
                  content={
                    <LayoutContent>
                      {worker.accounts.length === 0 ? (
                        <span className="text-base text-secondary">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {worker.accounts.map((a) => (
                            <Badge key={a.id} variant="neutral" label={a.name} />
                          ))}
                        </div>
                      )}
                    </LayoutContent>
                  }
                />
              </Card>
            </div>

            {/* Change history card */}
            <div>
              <Card>
                <Layout
                  header={
                    <LayoutHeader hasDivider>
                      <CardTitle className="flex items-center gap-2">
                        <Clock className="size-4 text-secondary" />
                        Change history
                      </CardTitle>
                    </LayoutHeader>
                  }
                  content={
                    <LayoutContent>
                      {historyLoading ? (
                        <div className="space-y-3">
                          {Array.from({ length: 3 }).map((_, i) => (
                            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows are positional
                            <Skeleton key={i} height={40} />
                          ))}
                        </div>
                      ) : !history || history.length === 0 ? (
                        <EmptyState title="No changes yet" description="Edits will appear here." />
                      ) : (
                        <ul className="space-y-3">
                          {history.map((entry, i) => (
                            <li
                              // biome-ignore lint/suspicious/noArrayIndexKey: history entries have no stable client-side key
                              key={i}
                              className="border-b border-border pb-3 last:border-0 last:pb-0"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-base font-medium text-primary capitalize">
                                    {entry.action}
                                  </p>
                                  <p className="text-base text-secondary truncate">
                                    <span className="font-mono">{entry.field}</span>
                                    {': '}
                                    <span className="line-through opacity-60">
                                      {entry.from_val ?? '—'}
                                    </span>
                                    {' → '}
                                    <span>{entry.to_val ?? '—'}</span>
                                  </p>
                                  <p className="text-xs text-disabled mt-0.5">
                                    by {entry.by_user_id}
                                  </p>
                                </div>
                                <span className="flex-none text-xs text-disabled whitespace-nowrap">
                                  {formatRelative(entry.at)}
                                </span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </LayoutContent>
                  }
                />
              </Card>
            </div>
          </PageContainer>
        </LayoutContent>
      }
    />
  );
}

function WorkerCvActions({ worker, canEdit }: { worker: WorkerDetail; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const download = useMutation({
    mutationFn: () => getWorkerCvDownloadUrl(worker.worker_id),
    onSuccess: (url) => window.open(url, '_blank', 'noopener'),
    onError: (e: Error) => toast({ body: e.message, type: 'error' }),
  });

  const replace = useMutation({
    mutationFn: async (file: File) => {
      const { upload_url, s3_key } = await requestWorkerCvUpload(
        worker.worker_id,
        file.name,
        file.type || 'application/octet-stream',
      );
      await putToS3(upload_url, file);
      await editWorker(worker.worker_id, {
        expected_version: worker.version,
        patch: { cv_storage_key: s3_key },
      });
    },
    onSuccess: () => {
      toast({ body: 'CV updated' });
      void queryClient.invalidateQueries({ queryKey: peopleKeys.worker(worker.worker_id) });
    },
    onError: (e: Error) => toast({ body: e.message, type: 'error' }),
  });

  return (
    <span className="flex items-center gap-2">
      {worker.cv_storage_key ? (
        <Button
          variant="ghost"
          size="sm"
          label="Download"
          isDisabled={download.isPending}
          onClick={() => download.mutate()}
          className="h-auto p-0"
        />
      ) : (
        <span className="text-secondary">—</span>
      )}
      {canEdit && (
        <label className="cursor-pointer text-base text-accent hover:underline">
          {replace.isPending ? 'Uploading…' : worker.cv_storage_key ? 'Replace' : 'Upload'}
          <input
            type="file"
            accept=".pdf,.docx"
            className="hidden"
            disabled={replace.isPending}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) replace.mutate(f);
              e.target.value = '';
            }}
          />
        </label>
      )}
    </span>
  );
}
