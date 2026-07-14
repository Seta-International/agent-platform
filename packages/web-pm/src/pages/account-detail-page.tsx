import {
  AsyncCombobox,
  Banner,
  Button,
  Card,
  CardTitle,
  Input,
  Label,
  LabelChip,
  Layout,
  LayoutContent,
  LayoutHeader,
  PageChrome,
  Skeleton,
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
import { useWorkerSearch } from '../api/worker-search.ts';
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
  const [recruiterIds, setRecruiterIds] = useState<string[]>([]);
  const [recruiterError, setRecruiterError] = useState<string | null>(null);

  const workerPicker = useWorkerSearch();

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
    setRecruiterIds(account.recruiter_worker_ids);
    setRecruiterError(null);
    setEditingRecruiters(true);
  }

  function cancelEditRecruiters() {
    setEditingRecruiters(false);
    setRecruiterIds([]);
    setRecruiterError(null);
  }

  function submitRecruiters() {
    saveRecruitersMutation.mutate(recruiterIds);
  }

  const recruiterLabels = useQuery({
    queryKey: [
      'people',
      'worker-resolve',
      [account?.am_worker_id, ...(account?.recruiter_worker_ids ?? [])].filter(Boolean).sort(),
    ],
    queryFn: () =>
      workerPicker.resolveByIds(
        [account?.am_worker_id, ...(account?.recruiter_worker_ids ?? [])].filter(
          (x): x is string => !!x,
        ),
      ),
    enabled: !!account,
  });
  const nameOf = (id: string) => recruiterLabels.data?.find((o) => o.value === id)?.label ?? id;

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
      <Button size="sm" label="Edit" onClick={startEdit} />
    ) : canManage && editing ? (
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          label="Cancel"
          onClick={cancelEdit}
          isDisabled={saveMutation.isPending}
        />
        <Button
          size="sm"
          label={saveMutation.isPending ? 'Saving…' : 'Save'}
          onClick={() => saveMutation.mutate()}
          isDisabled={saveMutation.isPending}
        />
      </div>
    ) : undefined;

  if (isLoading) {
    return (
      <PageChrome title="Account" breadcrumb={[backLink]}>
        <div className="page-container p-6 space-y-4">
          <Card>
            <Layout
              header={
                <LayoutHeader hasDivider>
                  <Skeleton height={20} width={192} />
                </LayoutHeader>
              }
              content={
                <LayoutContent>
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows are positional
                      <Skeleton key={i} height={16} />
                    ))}
                  </div>
                </LayoutContent>
              }
            />
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
          <Banner status="error" title={msg} />
        </div>
      </PageChrome>
    );
  }

  return (
    <PageChrome title={account.name} breadcrumb={[backLink]} actions={headerActions}>
      <div className="page-container grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 p-6 items-start">
        {/* Details card */}
        <Card>
          <Layout
            header={
              <LayoutHeader hasDivider>
                <CardTitle>{account.name}</CardTitle>
              </LayoutHeader>
            }
            content={
              <LayoutContent>
                {editError && <Banner status="error" className="mb-4" title={editError} />}

                {editing ? (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <Input
                        label="Name *"
                        value={draft.name ?? ''}
                        onChange={(value) => setDraft((d) => ({ ...d, name: value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Input
                        label="Industry"
                        value={draft.industry ?? ''}
                        onChange={(value) => setDraft((d) => ({ ...d, industry: value || null }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Account Manager</Label>
                      <AsyncCombobox
                        value={draft.am_worker_id ?? null}
                        onChange={(v) => setDraft((d) => ({ ...d, am_worker_id: v }))}
                        search={workerPicker.search}
                        resolveByIds={workerPicker.resolveByIds}
                        placeholder="Search workers…"
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <FieldRow label="Name" value={account.name} />
                    <FieldRow label="Industry" value={account.industry} />
                    <FieldRow
                      label="Account Manager"
                      value={account.am_worker_id ? nameOf(account.am_worker_id) : null}
                    />
                    <FieldRow label="Version" value={String(account.version)} />
                  </div>
                )}
              </LayoutContent>
            }
          />
        </Card>

        {/* Recruiters card */}
        <Card>
          <Layout
            header={
              <LayoutHeader hasDivider>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2">
                    <Users className="size-4 text-ink-muted" />
                    Recruiters
                  </CardTitle>
                  {canManage && !editingRecruiters && (
                    <Button
                      size="sm"
                      variant="secondary"
                      label="Edit"
                      onClick={startEditRecruiters}
                    />
                  )}
                </div>
              </LayoutHeader>
            }
            content={
              <LayoutContent>
                {editingRecruiters ? (
                  <div className="space-y-3">
                    <AsyncCombobox
                      multiple
                      value={recruiterIds}
                      onChange={setRecruiterIds}
                      search={workerPicker.search}
                      resolveByIds={workerPicker.resolveByIds}
                      placeholder="Search workers…"
                    />
                    {recruiterError && <Banner status="error" title={recruiterError} />}
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        label="Cancel"
                        onClick={cancelEditRecruiters}
                        isDisabled={saveRecruitersMutation.isPending}
                      />
                      <Button
                        size="sm"
                        label={saveRecruitersMutation.isPending ? 'Saving…' : 'Save'}
                        onClick={submitRecruiters}
                        isDisabled={saveRecruitersMutation.isPending}
                      />
                    </div>
                  </div>
                ) : account.recruiter_worker_ids.length === 0 ? (
                  <p className="text-body-sm text-ink-muted">No recruiters assigned.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {account.recruiter_worker_ids.map((id) => (
                      <LabelChip key={id} name={nameOf(id)} />
                    ))}
                  </div>
                )}
              </LayoutContent>
            }
          />
        </Card>
      </div>
    </PageChrome>
  );
}
