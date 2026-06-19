import {
  Alert,
  AlertDescription,
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
  Skeleton,
  Switch,
  toast,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ChevronLeft, Clock, KeyRound } from 'lucide-react';
import { useState } from 'react';
import {
  editWorker,
  fetchWorker,
  fetchWorkerHistory,
  setPortalAccess,
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

function LifecycleBadge({ stage }: { stage: string }) {
  const variantMap: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    active: 'default',
    onboarding: 'secondary',
    offboarding: 'outline',
    terminated: 'destructive',
    leave: 'outline',
  };
  return (
    <Badge variant={variantMap[stage] ?? 'secondary'} className="capitalize">
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
  const canEdit = usePermission('people.worker.edit');
  const canSetPortal = usePermission('people.worker.portal_access.set');

  const portalMutation = useMutation({
    mutationFn: (enabled: boolean) => setPortalAccess(workerId, enabled),
    onSuccess: (r) => {
      toast.success(r.portal_access ? 'Portal access enabled' : 'Portal access disabled');
      void queryClient.invalidateQueries({ queryKey: peopleKeys.worker(workerId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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

  function startEdit() {
    if (!worker) return;
    setDraft({
      full_name: worker.full_name,
      work_email: worker.work_email ?? '',
      phone: worker.phone ?? '',
      dob: worker.dob ?? '',
      gender: worker.gender ?? '',
      emergency_contact: worker.emergency_contact ?? '',
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
      to="/people"
      className="flex items-center gap-1 text-body-sm text-ink-muted hover:text-ink transition-colors"
    >
      <ChevronLeft className="size-4" />
      People
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
                    <Input
                      value={draft.gender ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, gender: e.target.value }))}
                    />
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
                  <FieldRow label="Work email" value={worker.work_email} />
                  <FieldRow label="Phone" value={worker.phone} />
                  <FieldRow label="Date of birth" value={worker.dob} />
                  <FieldRow label="Gender" value={worker.gender} />
                  <FieldRow label="Emergency contact" value={worker.emergency_contact} />
                  <FieldRow
                    label="Lifecycle stage"
                    value={<LifecycleBadge stage={worker.lifecycle_stage} />}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Change history card */}
        <div>
          {canSetPortal && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="size-4 text-ink-muted" />
                  Login &amp; access
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-body-sm font-medium text-ink">Portal access</p>
                    <p className="text-body-sm text-ink-muted">
                      {worker.portal_access
                        ? 'This person can sign in.'
                        : worker.work_email
                          ? 'Turn on to provision a login.'
                          : 'A work email is required before access can be granted.'}
                    </p>
                  </div>
                  <Switch
                    checked={worker.portal_access}
                    disabled={
                      portalMutation.isPending || (!worker.portal_access && !worker.work_email)
                    }
                    onCheckedChange={(v) => portalMutation.mutate(v)}
                    aria-label="Portal access"
                  />
                </div>
              </CardContent>
            </Card>
          )}
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
