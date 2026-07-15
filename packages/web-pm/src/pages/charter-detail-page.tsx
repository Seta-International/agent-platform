import {
  Badge,
  Banner,
  Button,
  Card,
  CardTitle,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Layout,
  LayoutContent,
  LayoutHeader,
  PageChrome,
  Skeleton,
  Textarea,
  toast,
  useSeededItems,
} from '@seta/shared-ui';
import { usePermission, useSession } from '@seta/web-identity';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import {
  bodApproveCharter,
  type CharterDetail,
  fetchAccounts,
  fetchCharter,
  pmoSignOffCharter,
  rejectCharter,
  withdrawCharter,
} from '../api/pm-client.ts';
import { useWorkerSource } from '../api/worker-search';
import { pmKeys } from '../state/query-keys.ts';
import { CharterStaffingEditor } from './charter-staffing-editor.tsx';
import { CharterStepper } from './charter-stepper.tsx';

const METHODOLOGY_LABEL: Record<string, string> = { scrum: 'Scrum', kanban: 'Kanban' };
const PRICING_LABEL: Record<string, string> = { fixed_price: 'Fixed-price', time_materials: 'T&M' };

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-surface p-3">
      <div className="text-[10.5px] uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="mt-0.5 text-body-sm font-medium text-ink">{value ?? '—'}</div>
    </div>
  );
}

function ScopeBox({ label, text }: { label: string; text?: string | null }) {
  return (
    <div className="rounded-md border border-hairline bg-surface-2 p-3.5">
      <div className="text-[12px] font-semibold text-ink">{label}</div>
      <div className="mt-1 whitespace-pre-line text-body-sm leading-relaxed text-ink-muted">
        {text?.trim() ? text : '—'}
      </div>
    </div>
  );
}

const STATUS_META: Record<
  CharterDetail['status'],
  { label: string; variant: 'neutral' | 'success' | 'error' }
> = {
  submitted: { label: 'Awaiting PMO review', variant: 'neutral' },
  pmo_approved: { label: 'Awaiting BoD review', variant: 'neutral' },
  approved: { label: 'Approved · created', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'error' },
  withdrawn: { label: 'Withdrawn', variant: 'neutral' },
};

export function CharterDetailPage({ charterId }: { charterId: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const canPmo = usePermission('pm.charter.pmo_signoff');
  const canBod = usePermission('pm.charter.bod_approve');
  const canSubmit = usePermission('pm.charter.submit');
  const canManageProject = usePermission('pm.project.manage');
  const { user_id: currentUserId } = useSession();

  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const {
    data: c,
    isLoading,
    error: loadError,
  } = useQuery({
    queryKey: pmKeys.charter(charterId),
    queryFn: () => fetchCharter(charterId),
  });

  const { data: accounts } = useQuery({ queryKey: pmKeys.accounts(), queryFn: fetchAccounts });
  const workerSource = useWorkerSource();
  const workerIds = [c?.pm_worker_id, c?.pmo_worker_id].filter((id): id is string => !!id);
  const [resolvedWorkers] = useSeededItems(workerIds, workerSource.seed);
  const workerName = (id: string | null) =>
    id ? (resolvedWorkers.find((o) => o.id === id)?.label ?? id.slice(0, 8)) : '—';
  const accountName = (id: string) =>
    accounts?.find((a) => a.account_id === id)?.name ?? id.slice(0, 8);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: pmKeys.charter(charterId) });
    void queryClient.invalidateQueries({ queryKey: pmKeys.charters() });
    void queryClient.invalidateQueries({ queryKey: pmKeys.projects() });
  }

  const pmoMutation = useMutation({
    mutationFn: () => pmoSignOffCharter(charterId, c?.version),
    onSuccess: () => {
      toast.success('PMO sign-off recorded — sent to BoD');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bodMutation = useMutation({
    mutationFn: () => bodApproveCharter(charterId, c?.version),
    onSuccess: (r) => {
      toast.success('Approved — project created');
      invalidate();
      void navigate({ to: '/pm/projects/$projectId', params: { projectId: r.project_id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rejectMutation = useMutation({
    mutationFn: () => rejectCharter(charterId, reason, c?.version),
    onSuccess: () => {
      toast.success('Charter rejected');
      setRejecting(false);
      setReason('');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const withdrawMutation = useMutation({
    mutationFn: () => withdrawCharter(charterId, c?.version),
    onSuccess: () => {
      toast.success('Charter withdrawn');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const backLink = (
    <Link
      to="/pm/requests"
      className="flex items-center gap-1 text-body-sm text-ink-muted hover:text-ink transition-colors"
    >
      <ChevronLeft className="size-4" />
      Requests
    </Link>
  );

  if (isLoading) {
    return (
      <PageChrome title="Request" breadcrumb={[backLink]}>
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
                    {Array.from({ length: 6 }).map((_, i) => (
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

  if (loadError || !c) {
    const msg = (loadError as Error | null)?.message ?? 'Charter not found';
    return (
      <PageChrome title="Request" breadcrumb={[backLink]}>
        <div className="page-container p-6">
          <Banner status="error" title={msg} />
        </div>
      </PageChrome>
    );
  }

  const showPmo = canPmo && c.status === 'submitted';
  const showBod = canBod && c.status === 'pmo_approved';
  const showReject =
    (canPmo && c.status === 'submitted') || (canBod && c.status === 'pmo_approved');
  const showWithdraw =
    (c.status === 'submitted' || c.status === 'pmo_approved') &&
    canSubmit &&
    currentUserId === c.submitted_by_user_id;

  const headerActions =
    showPmo || showBod || showReject || showWithdraw ? (
      <div className="flex items-center gap-2">
        {showWithdraw && (
          <Button
            size="sm"
            variant="secondary"
            label={withdrawMutation.isPending ? 'Withdrawing…' : 'Withdraw'}
            onClick={() => withdrawMutation.mutate()}
            isDisabled={withdrawMutation.isPending}
          />
        )}
        {showReject && (
          <Button size="sm" variant="secondary" label="Reject" onClick={() => setRejecting(true)} />
        )}
        {showPmo && (
          <Button
            size="sm"
            label={pmoMutation.isPending ? 'Signing off…' : 'PMO sign-off'}
            onClick={() => pmoMutation.mutate()}
            isDisabled={pmoMutation.isPending}
          />
        )}
        {showBod && (
          <Button
            size="sm"
            label={bodMutation.isPending ? 'Approving…' : 'BoD approve · create project'}
            onClick={() => bodMutation.mutate()}
            isDisabled={bodMutation.isPending}
          />
        )}
      </div>
    ) : undefined;

  return (
    <PageChrome title={c.name} breadcrumb={[backLink]} actions={headerActions}>
      <div className="page-container p-6 space-y-4">
        <Card padding={4}>
          <CharterStepper status={c.status} rejectedStage={c.rejected_stage} />
        </Card>

        {c.status === 'rejected' && c.rejection_reason && (
          <Banner
            status="error"
            title={
              <>
                Rejected at {c.rejected_stage === 'bod' ? 'BoD' : 'PMO'} review:{' '}
                {c.rejection_reason}
              </>
            }
          />
        )}

        <Card>
          <Layout
            header={
              <LayoutHeader hasDivider>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>Charter</CardTitle>
                  <Badge
                    variant={STATUS_META[c.status].variant}
                    label={STATUS_META[c.status].label}
                  />
                </div>
              </LayoutHeader>
            }
            content={
              <LayoutContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-hairline bg-hairline sm:grid-cols-4">
                    <Fact label="Account" value={accountName(c.account_id)} />
                    <Fact label="PM" value={workerName(c.pm_worker_id)} />
                    <Fact label="PMO" value={workerName(c.pmo_worker_id)} />
                    <Fact
                      label="Methodology"
                      value={c.methodology ? METHODOLOGY_LABEL[c.methodology] : null}
                    />
                    <Fact
                      label="Pricing"
                      value={c.pricing_model ? PRICING_LABEL[c.pricing_model] : null}
                    />
                    <Fact
                      label="Team size"
                      value={c.team_size != null ? String(c.team_size) : null}
                    />
                    <Fact
                      label="Budget"
                      value={
                        c.budget_bmm != null && Number(c.budget_bmm) > 0
                          ? `${Number(c.budget_bmm)} BMM`
                          : null
                      }
                    />
                    <Fact
                      label="Timeline"
                      value={c.date_from ? `${c.date_from} → ${c.date_to ?? '?'}` : null}
                    />
                  </div>

                  <ScopeBox label="Objective" text={c.objective} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ScopeBox label="In scope" text={c.scope?.in} />
                    <ScopeBox label="Out of scope" text={c.scope?.out} />
                  </div>

                  {c.status === 'approved' && c.project_id && (
                    <Link
                      to="/pm/projects/$projectId"
                      params={{ projectId: c.project_id }}
                      className="flex items-center justify-between rounded-md border border-hairline bg-surface-2 px-3.5 py-3 text-body-sm font-medium text-ink transition-colors hover:border-blue/40"
                    >
                      <span>Open live project</span>
                      <ChevronRight className="size-4 text-ink-muted" />
                    </Link>
                  )}
                </div>
              </LayoutContent>
            }
          />
        </Card>

        {c.status === 'approved' && c.project_id && (
          <CharterStaffingEditor
            projectId={c.project_id}
            dateFrom={c.date_from}
            dateTo={c.date_to}
            canManage={canManageProject}
          />
        )}
      </div>

      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject charter</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              label="Reason"
              isRequired
              value={reason}
              onChange={(value) => setReason(value)}
              placeholder="Explain the reason for rejection…"
              rows={4}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                label="Cancel"
                onClick={() => {
                  setRejecting(false);
                  setReason('');
                }}
                isDisabled={rejectMutation.isPending}
              />
              <Button
                variant="destructive"
                label={rejectMutation.isPending ? 'Rejecting…' : 'Reject'}
                onClick={() => rejectMutation.mutate()}
                isDisabled={rejectMutation.isPending || !reason.trim()}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </PageChrome>
  );
}
