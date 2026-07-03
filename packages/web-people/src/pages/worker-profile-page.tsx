import {
  Alert,
  AlertDescription,
  AsyncCombobox,
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  formatRelative,
  Input,
  Label,
  PageChrome,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  toast,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ChevronLeft, Clock } from 'lucide-react';
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
  type WorkerDetail,
  type WorkerPatch,
} from '../api/people-client.ts';
import { peopleKeys } from '../state/query-keys.ts';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

function LifecycleBadge({ stage }: { stage: string | null }) {
  const variantMap: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    active: 'default',
    onboarding: 'secondary',
    offboarding: 'outline',
    terminated: 'destructive',
    leave: 'outline',
  };
  return (
    <Badge variant={(stage ? variantMap[stage] : undefined) ?? 'secondary'} className="capitalize">
      {stage}
    </Badge>
  );
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 items-start py-2 border-b border-hairline last:border-0">
      <span className="text-body-sm text-ink-muted font-medium">{label}</span>
      <span className="text-body-sm text-ink break-all">{value ?? '—'}</span>
    </div>
  );
}

export function WorkerProfilePage() {
  const params = useParams({ strict: false });
  const workerId = params.workerId as string;
  const queryClient = useQueryClient();
  const canEdit = usePermission('people.worker.update');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<WorkerPatch>({});
  const [editError, setEditError] = useState<string | null>(null);

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
    mutationFn: () => {
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
      return editWorker(workerId, { expected_version: worker.version, patch });
    },
    onSuccess: () => {
      toast.success('Changes saved');
      setEditing(false);
      setDraft({});
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

  const skillsMutation = useMutation({
    mutationFn: async ({ adds, removes }: { adds: string[]; removes: string[] }) => {
      await Promise.all([
        ...removes.map((id) => removeWorkerSkill(workerId, id)),
        ...adds.map((id) => addWorkerSkill(workerId, id)),
      ]);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: peopleKeys.worker(workerId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
    });
    setEditError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setDraft({});
    setEditError(null);
  }

  const backLink = (
    <Link
      to="/people/employees"
      className="flex items-center gap-1 text-body-sm text-ink-muted hover:text-ink transition-colors"
    >
      <ChevronLeft className="size-4" />
      Employees
    </Link>
  );

  const headerActions =
    canEdit && !editing && worker ? (
      <Button size="sm" onClick={startEdit}>
        Edit
      </Button>
    ) : canEdit && editing ? (
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={cancelEdit}
          disabled={saveMutation.isPending}
        >
          Cancel
        </Button>
        <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    ) : undefined;

  if (workerLoading) {
    return (
      <PageChrome title="Profile" breadcrumb={[backLink]}>
        <div className="page-container p-6 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-4">
                <Skeleton className="size-14 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows are positional
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </PageChrome>
    );
  }

  if (workerError || !worker) {
    const msg = (workerError as Error | null)?.message ?? 'Worker not found';
    return (
      <PageChrome title="Profile" breadcrumb={[backLink]}>
        <div className="page-container p-6">
          <Alert variant="destructive">
            <AlertDescription>{msg}</AlertDescription>
          </Alert>
        </div>
      </PageChrome>
    );
  }

  const currentSkillIds = worker.skills.map((s) => s.id);

  return (
    <PageChrome title={worker.full_name} breadcrumb={[backLink]} actions={headerActions}>
      <div className="page-container grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 p-6 items-start">
        <div className="space-y-6">
          {/* Profile card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-4">
                <Avatar className="size-14">
                  <AvatarFallback className="text-lg">{initials(worker.full_name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-card-title font-semibold truncate">
                      {worker.full_name}
                    </span>
                    <LifecycleBadge stage={worker.lifecycle_stage} />
                  </div>
                  <p className="text-body-sm text-ink-muted truncate">{worker.work_email || '—'}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {editError && (
                <Alert variant="destructive" className="mb-4">
                  <AlertDescription>{editError}</AlertDescription>
                </Alert>
              )}

              {editing ? (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <Label>Full name</Label>
                    <Input
                      value={draft.full_name ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, full_name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Job title</Label>
                    <Input
                      value={draft.job_title ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, job_title: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Org unit</Label>
                    <AsyncCombobox
                      search={searchOrgUnits.search}
                      resolveByIds={searchOrgUnits.resolveByIds}
                      value={draft.org_unit_id ?? null}
                      onChange={(v) => {
                        setDraft((d) => ({ ...d, org_unit_id: v }));
                      }}
                      placeholder="Search org units…"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Manager</Label>
                    <p className="text-body-sm text-ink py-2">{worker.manager_name ?? '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label>Work email</Label>
                    <Input
                      type="email"
                      value={draft.work_email ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, work_email: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Phone</Label>
                    <Input
                      value={draft.phone ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Date of birth</Label>
                    <Input
                      type="date"
                      value={draft.dob ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, dob: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Gender</Label>
                    <Select
                      value={draft.gender ?? ''}
                      onValueChange={(v) => setDraft((d) => ({ ...d, gender: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent>
                        {GENDER_OPTIONS.map((g) => (
                          <SelectItem key={g.value} value={g.value}>
                            {g.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Emergency contact</Label>
                    <Input
                      value={draft.emergency_contact ?? ''}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, emergency_contact: e.target.value }))
                      }
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <FieldRow label="Full name" value={worker.full_name} />
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
            </CardContent>
          </Card>

          {/* Techstack card */}
          <Card>
            <CardHeader>
              <CardTitle>Techstack</CardTitle>
            </CardHeader>
            <CardContent>
              {worker.skills.length === 0 && !canEdit ? (
                <span className="text-body-sm text-ink-muted">—</span>
              ) : (
                <div className="space-y-3">
                  {worker.skills.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {worker.skills.map((s) => (
                        <Badge key={s.id} variant="secondary" className="flex items-center gap-1">
                          {s.name}
                          {canEdit && (
                            <button
                              type="button"
                              aria-label={`Remove ${s.name}`}
                              className="ml-1 text-ink-muted hover:text-ink transition-colors leading-none"
                              onClick={() => {
                                skillsMutation.mutate({ adds: [], removes: [s.id] });
                              }}
                            >
                              ×
                            </button>
                          )}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {canEdit && (
                    <AsyncCombobox
                      multiple
                      search={searchSkills.search}
                      resolveByIds={searchSkills.resolveByIds}
                      value={currentSkillIds}
                      onChange={(next) => {
                        const prev = new Set(currentSkillIds);
                        const nextSet = new Set(next);
                        const adds = next.filter((id) => !prev.has(id));
                        const removes = currentSkillIds.filter((id) => !nextSet.has(id));
                        if (adds.length === 0 && removes.length === 0) return;
                        skillsMutation.mutate({ adds, removes });
                      }}
                      placeholder="Add skills…"
                    />
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Engagements card */}
          <Card>
            <CardHeader>
              <CardTitle>Engagements</CardTitle>
            </CardHeader>
            <CardContent>
              {worker.accounts.length === 0 ? (
                <span className="text-body-sm text-ink-muted">—</span>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {worker.accounts.map((a) => (
                    <Badge key={a.id} variant="outline">
                      {a.name}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Change history card */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="size-4 text-ink-muted" />
                Change history
              </CardTitle>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows are positional
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : !history || history.length === 0 ? (
                <EmptyState title="No changes yet" description="Edits will appear here." />
              ) : (
                <ul className="space-y-3">
                  {history.map((entry, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: history entries have no stable client-side key
                    <li key={i} className="border-b border-hairline pb-3 last:border-0 last:pb-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-body-sm font-medium text-ink capitalize">
                            {entry.action}
                          </p>
                          <p className="text-body-sm text-ink-muted truncate">
                            <span className="font-mono">{entry.field}</span>
                            {': '}
                            <span className="line-through opacity-60">{entry.from_val ?? '—'}</span>
                            {' → '}
                            <span>{entry.to_val ?? '—'}</span>
                          </p>
                          <p className="text-[11px] text-ink-tertiary mt-0.5">
                            by {entry.by_user_id}
                          </p>
                        </div>
                        <span className="flex-none text-[11px] text-ink-tertiary whitespace-nowrap">
                          {formatRelative(entry.at)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageChrome>
  );
}

function WorkerCvActions({ worker, canEdit }: { worker: WorkerDetail; canEdit: boolean }) {
  const queryClient = useQueryClient();

  const download = useMutation({
    mutationFn: () => getWorkerCvDownloadUrl(worker.worker_id),
    onSuccess: (url) => window.open(url, '_blank', 'noopener'),
    onError: (e: Error) => toast.error(e.message),
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
      toast.success('CV updated');
      void queryClient.invalidateQueries({ queryKey: peopleKeys.worker(worker.worker_id) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <span className="flex items-center gap-2">
      {worker.cv_storage_key ? (
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0"
          disabled={download.isPending}
          onClick={() => download.mutate()}
        >
          Download
        </Button>
      ) : (
        <span className="text-ink-muted">—</span>
      )}
      {canEdit && (
        <label className="cursor-pointer text-body-sm text-primary hover:underline">
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
