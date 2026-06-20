import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  LabelChip,
  PageChrome,
  Skeleton,
  Textarea,
  toast,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ChevronLeft, Users } from 'lucide-react';
import { useState } from 'react';
import {
  type AccountPatch,
  editAccount,
  fetchAccount,
  setAccountRecruiters,
} from '../api/pm-client.ts';
import { pmKeys } from '../state/query-keys.ts';

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 items-start py-2 border-b border-hairline last:border-0">
      <span className="text-body-sm text-ink-muted font-medium">{label}</span>
      <span className="text-body-sm text-ink break-all">{value ?? '—'}</span>
    </div>
  );
}

export function AccountDetailPage({ accountId }: { accountId: string }) {
  const queryClient = useQueryClient();
  const canManage = usePermission('pm.account.manage');

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<AccountPatch>({});
  const [editError, setEditError] = useState<string | null>(null);

  // Recruiter management state
  const [editingRecruiters, setEditingRecruiters] = useState(false);
  const [recruiterDraft, setRecruiterDraft] = useState('');
  const [recruiterError, setRecruiterError] = useState<string | null>(null);

  const {
    data: account,
    isLoading,
    error: loadError,
  } = useQuery({
    queryKey: pmKeys.account(accountId),
    queryFn: () => fetchAccount(accountId),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!account) throw new Error('No account data');
      const patch: AccountPatch = {};
      if (draft.name !== undefined && draft.name !== account.name) patch.name = draft.name;
      if (draft.industry !== undefined && draft.industry !== account.industry)
        patch.industry = draft.industry;
      if (draft.am_worker_id !== undefined && draft.am_worker_id !== account.am_worker_id)
        patch.am_worker_id = draft.am_worker_id;
      return editAccount(accountId, { expected_version: account.version, patch });
    },
    onSuccess: () => {
      toast.success('Changes saved');
      setEditing(false);
      setDraft({});
      setEditError(null);
      void queryClient.invalidateQueries({ queryKey: pmKeys.account(accountId) });
      void queryClient.invalidateQueries({ queryKey: pmKeys.accounts() });
    },
    onError: (e: Error) => {
      if ((e as { status?: number }).status === 409) {
        setEditError('Another change was made while you were editing. Please refresh and retry.');
        void queryClient.invalidateQueries({ queryKey: pmKeys.account(accountId) });
      } else {
        setEditError(e.message);
      }
    },
  });

  const saveRecruitersMutation = useMutation({
    mutationFn: (ids: string[]) => setAccountRecruiters(accountId, ids),
    onSuccess: (r) => {
      toast.success(`Recruiters updated (${r.added} added, ${r.removed} removed)`);
      setEditingRecruiters(false);
      setRecruiterDraft('');
      setRecruiterError(null);
      void queryClient.invalidateQueries({ queryKey: pmKeys.account(accountId) });
      void queryClient.invalidateQueries({ queryKey: pmKeys.accounts() });
    },
    onError: (e: Error) => setRecruiterError(e.message),
  });

  function startEdit() {
    if (!account) return;
    setDraft({
      name: account.name,
      industry: account.industry ?? '',
      am_worker_id: account.am_worker_id ?? '',
    });
    setEditError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setDraft({});
    setEditError(null);
  }

  function startEditRecruiters() {
    if (!account) return;
    setRecruiterDraft(account.recruiter_worker_ids.join('\n'));
    setRecruiterError(null);
    setEditingRecruiters(true);
  }

  function cancelEditRecruiters() {
    setEditingRecruiters(false);
    setRecruiterDraft('');
    setRecruiterError(null);
  }

  function submitRecruiters() {
    const ids = recruiterDraft
      .split(/[\n,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    saveRecruitersMutation.mutate(ids);
  }

  const backLink = (
    <Link
      to="/pm/accounts"
      className="flex items-center gap-1 text-body-sm text-ink-muted hover:text-ink transition-colors"
    >
      <ChevronLeft className="size-4" />
      Accounts
    </Link>
  );

  const headerActions =
    canManage && !editing && account ? (
      <Button size="sm" onClick={startEdit}>
        Edit
      </Button>
    ) : canManage && editing ? (
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

  if (isLoading) {
    return (
      <PageChrome title="Account" breadcrumb={[backLink]}>
        <div className="page-container p-6 space-y-4">
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-48" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
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

  if (loadError || !account) {
    const msg = (loadError as Error | null)?.message ?? 'Account not found';
    return (
      <PageChrome title="Account" breadcrumb={[backLink]}>
        <div className="page-container p-6">
          <Alert variant="destructive">
            <AlertDescription>{msg}</AlertDescription>
          </Alert>
        </div>
      </PageChrome>
    );
  }

  return (
    <PageChrome title={account.name} breadcrumb={[backLink]} actions={headerActions}>
      <div className="page-container grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 p-6 items-start">
        {/* Details card */}
        <Card>
          <CardHeader>
            <CardTitle>{account.name}</CardTitle>
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
                  <Label>Name *</Label>
                  <Input
                    value={draft.name ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Industry</Label>
                  <Input
                    value={draft.industry ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, industry: e.target.value || null }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Account Manager (worker ID)</Label>
                  <Input
                    value={draft.am_worker_id ?? ''}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, am_worker_id: e.target.value || null }))
                    }
                    placeholder="UUID or leave blank"
                    className="font-mono"
                  />
                </div>
              </div>
            ) : (
              <div>
                <FieldRow label="Name" value={account.name} />
                <FieldRow label="Industry" value={account.industry} />
                <FieldRow
                  label="Account Manager"
                  value={
                    account.am_worker_id ? (
                      <span className="font-mono text-caption">{account.am_worker_id}</span>
                    ) : null
                  }
                />
                <FieldRow label="Version" value={String(account.version)} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recruiters card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <Users className="size-4 text-ink-muted" />
                Recruiters
              </CardTitle>
              {canManage && !editingRecruiters && (
                <Button size="sm" variant="secondary" onClick={startEditRecruiters}>
                  Edit
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {editingRecruiters ? (
              <div className="space-y-3">
                <p className="text-body-sm text-ink-muted">
                  Enter one worker ID per line (UUIDs). Existing recruiters not listed will be
                  removed.
                </p>
                <Textarea
                  className="min-h-[120px] font-mono resize-y"
                  value={recruiterDraft}
                  onChange={(e) => setRecruiterDraft(e.target.value)}
                  placeholder="Paste worker UUIDs, one per line…"
                />
                {recruiterError && (
                  <Alert variant="destructive">
                    <AlertDescription>{recruiterError}</AlertDescription>
                  </Alert>
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={cancelEditRecruiters}
                    disabled={saveRecruitersMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={submitRecruiters}
                    disabled={saveRecruitersMutation.isPending}
                  >
                    {saveRecruitersMutation.isPending ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </div>
            ) : account.recruiter_worker_ids.length === 0 ? (
              <p className="text-body-sm text-ink-muted">No recruiters assigned.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {account.recruiter_worker_ids.map((id) => (
                  <LabelChip key={id} name={id} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageChrome>
  );
}
