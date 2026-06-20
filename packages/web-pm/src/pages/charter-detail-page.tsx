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
  approveCharter,
  type CharterDetail,
  fetchCharter,
  rejectCharter,
  withdrawCharter,
} from '../api/pm-client.ts';
import { pmKeys } from '../state/query-keys.ts';

const STATUS_VARIANT: Record<
  CharterDetail['status'],
  'secondary' | 'success' | 'destructive' | 'outline'
> = {
  submitted: 'secondary',
  approved: 'success',
  rejected: 'destructive',
  withdrawn: 'outline',
};

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
  const canApprove = usePermission('pm.charter.approve');
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

  const approveMutation = useMutation({
    mutationFn: () => approveCharter(charterId, c?.version),
    onSuccess: (r) => {
      toast.success('Charter approved');
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

  const showApproveReject = canApprove && c.status === 'submitted';
  const showWithdraw = c.status === 'submitted' && currentUserId === c.submitted_by_user_id;

  const headerActions =
    showApproveReject || showWithdraw ? (
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
        {showApproveReject && (
          <>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setRejecting(true)}
              disabled={approveMutation.isPending}
            >
              Reject
            </Button>
            <Button
              size="sm"
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending ? 'Approving…' : 'Approve'}
            </Button>
          </>
        )}
      </div>
    ) : undefined;

  return (
    <PageChrome title={c.name} breadcrumb={[backLink]} actions={headerActions}>
      <div className="page-container p-6 space-y-4">
        {c.status === 'rejected' && c.rejection_reason && (
          <Alert variant="destructive">
            <AlertDescription>Rejected: {c.rejection_reason}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <CardTitle>{c.name}</CardTitle>
              <Badge variant={STATUS_VARIANT[c.status]}>{c.status}</Badge>
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
