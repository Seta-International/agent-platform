import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Label,
  PageChrome,
  Skeleton,
  Textarea,
  toast,
} from '@seta/shared-ui';
import { usePermission, useSession } from '@seta/web-identity';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import {
  bodApproveCharter,
  type CharterDetail,
  fetchCharter,
  pmoSignOffCharter,
  rejectCharter,
  withdrawCharter,
} from '../api/pm-client.ts';
import { pmKeys } from '../state/query-keys.ts';
import { CharterStaffingEditor } from './charter-staffing-editor.tsx';

const STATUS_META: Record<
  CharterDetail['status'],
  { label: string; variant: 'secondary' | 'success' | 'destructive' | 'outline' }
> = {
  submitted: { label: 'Awaiting PMO', variant: 'secondary' },
  pmo_approved: { label: 'Awaiting BoD', variant: 'secondary' },
  approved: { label: 'Approved · created', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'destructive' },
  withdrawn: { label: 'Withdrawn', variant: 'outline' },
};

const STEP_LABELS = ['Submitted', 'PMO Review', 'BoD Review', 'Project created'] as const;

function CharterStepper({ status }: { status: CharterDetail['status'] }) {
  const reached =
    status === 'submitted' ? 1 : status === 'pmo_approved' ? 2 : status === 'approved' ? 4 : 1;
  const terminal = status === 'rejected' || status === 'withdrawn';
  return (
    <div className="flex flex-wrap items-center gap-2">
      {STEP_LABELS.map((label, i) => {
        const done = i < reached && !(terminal && i >= reached);
        const current = !terminal && i === reached - 1 && status !== 'approved';
        return (
          <div key={label} className="flex items-center gap-2">
            <div
              className={[
                'flex size-6 items-center justify-center rounded-full text-[11px] font-semibold',
                done ? 'bg-blue text-white' : 'bg-surface-2 text-ink-muted',
                current ? 'ring-2 ring-blue/40' : '',
              ].join(' ')}
            >
              {i + 1}
            </div>
            <span className={done ? 'text-body-sm text-ink' : 'text-body-sm text-ink-muted'}>
              {label}
            </span>
            {i < STEP_LABELS.length - 1 && <span className="h-px w-6 bg-hairline" />}
          </div>
        );
      })}
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-2 items-start py-2 border-b border-hairline last:border-0">
      <span className="text-body-sm text-ink-muted font-medium">{label}</span>
      <span className="text-body-sm text-ink break-all">{value ?? '—'}</span>
    </div>
  );
}

export function CharterDetailPage({ charterId }: { charterId: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const canPmo = usePermission('pm.charter.pmo_signoff');
  const canBod = usePermission('pm.charter.bod_approve');
  const canSubmit = usePermission('pm.charter.submit');
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
            <CardHeader>
              <Skeleton className="h-5 w-48" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
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

  if (loadError || !c) {
    const msg = (loadError as Error | null)?.message ?? 'Charter not found';
    return (
      <PageChrome title="Request" breadcrumb={[backLink]}>
        <div className="page-container p-6">
          <Alert variant="destructive">
            <AlertDescription>{msg}</AlertDescription>
          </Alert>
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
            onClick={() => withdrawMutation.mutate()}
            disabled={withdrawMutation.isPending}
          >
            {withdrawMutation.isPending ? 'Withdrawing…' : 'Withdraw'}
          </Button>
        )}
        {showReject && (
          <Button size="sm" variant="secondary" onClick={() => setRejecting(true)}>
            Reject
          </Button>
        )}
        {showPmo && (
          <Button size="sm" onClick={() => pmoMutation.mutate()} disabled={pmoMutation.isPending}>
            {pmoMutation.isPending ? 'Signing off…' : 'PMO sign-off'}
          </Button>
        )}
        {showBod && (
          <Button size="sm" onClick={() => bodMutation.mutate()} disabled={bodMutation.isPending}>
            {bodMutation.isPending ? 'Approving…' : 'BoD approve · create project'}
          </Button>
        )}
      </div>
    ) : undefined;

  return (
    <PageChrome title={c.name} breadcrumb={[backLink]} actions={headerActions}>
      <div className="page-container p-6 space-y-4">
        <Card>
          <CardContent className="p-4">
            <CharterStepper status={c.status} />
          </CardContent>
        </Card>

        {c.status === 'rejected' && c.rejection_reason && (
          <Alert variant="destructive">
            <AlertDescription>
              Rejected at {c.rejected_stage === 'bod' ? 'BoD' : 'PMO'} review: {c.rejection_reason}
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <CardTitle>{c.name}</CardTitle>
              <Badge variant={STATUS_META[c.status].variant}>{STATUS_META[c.status].label}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <FieldRow label="Account" value={c.account_id} />
            <FieldRow
              label="PM"
              value={
                c.pm_worker_id ? (
                  <span className="font-mono text-caption">{c.pm_worker_id}</span>
                ) : null
              }
            />
            <FieldRow
              label="PMO"
              value={
                c.pmo_worker_id ? (
                  <span className="font-mono text-caption">{c.pmo_worker_id}</span>
                ) : null
              }
            />
            <FieldRow label="Methodology" value={c.methodology} />
            <FieldRow label="Pricing" value={c.pricing_model} />
            <FieldRow label="Team size" value={c.team_size !== null ? String(c.team_size) : null} />
            <FieldRow label="Budget (BMM)" value={c.budget_bmm} />
            <FieldRow
              label="Timeline"
              value={c.date_from ? `${c.date_from} → ${c.date_to ?? '?'}` : null}
            />
            {c.project_id && (
              <FieldRow
                label="Project"
                value={
                  <Link
                    to="/pm/projects/$projectId"
                    params={{ projectId: c.project_id }}
                    className="text-blue font-mono text-caption hover:underline"
                  >
                    {c.project_id}
                  </Link>
                }
              />
            )}
            <FieldRow label="Objective" value={c.objective} />
            <FieldRow label="Scope (in)" value={c.scope?.in} />
            <FieldRow label="Scope (out)" value={c.scope?.out} />
          </CardContent>
        </Card>

        {c.status === 'approved' && c.project_id && (
          <CharterStaffingEditor
            projectId={c.project_id}
            dateFrom={c.date_from}
            dateTo={c.date_to}
          />
        )}
      </div>

      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject charter</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Reason *</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain the reason for rejection…"
                className="min-h-[100px] resize-y"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setRejecting(false);
                  setReason('');
                }}
                disabled={rejectMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => rejectMutation.mutate()}
                disabled={rejectMutation.isPending || !reason.trim()}
              >
                {rejectMutation.isPending ? 'Rejecting…' : 'Reject'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </PageChrome>
  );
}
