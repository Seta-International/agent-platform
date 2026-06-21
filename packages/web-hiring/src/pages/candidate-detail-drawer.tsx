import {
  Badge,
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  toast,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { type CandStage, fetchCandidate, moveApplicationStage } from '../api/hiring-client.ts';
import { hiringKeys } from '../state/query-keys.ts';
import { CandidateTimeline } from './candidate-timeline.tsx';
import { fitLabel } from './candidate-utils.ts';
import { RejectDialog } from './reject-dialog.tsx';
import { TransferDialog } from './transfer-dialog.tsx';
import { on409 } from './utils.ts';

const STAGES: { id: CandStage; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'screening', label: 'Screening' },
  { id: 'interview', label: 'Interview' },
  { id: 'offer', label: 'Offer' },
];

export function CandidateDetailDrawer({
  candidateId,
  onClose,
}: {
  candidateId: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const canManage = usePermission('hiring.candidate.manage');
  const canReject = usePermission('hiring.candidate.reject');
  const canTransfer = usePermission('hiring.candidate.transfer');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: hiringKeys.candidate(candidateId ?? ''),
    queryFn: () => fetchCandidate(candidateId as string),
    enabled: !!candidateId,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: hiringKeys.candidate(candidateId ?? '') });
    void queryClient.invalidateQueries({ queryKey: hiringKeys.candidates() });
  };

  const app = data?.applications.find((a) => a.status === 'active') ?? data?.applications[0];

  const move = useMutation({
    mutationFn: (to: CandStage) =>
      moveApplicationStage(app!.application_id, {
        expected_version: app!.version,
        to,
      }),
    onSuccess: () => {
      toast.success('Stage updated');
      refresh();
    },
    onError: (e: Error) => on409(e, queryClient, hiringKeys.candidate(candidateId ?? '')),
  });
  const terminal = app ? app.status !== 'active' : true;
  const fit = app ? fitLabel(app.fit) : null;

  return (
    <Sheet open={!!candidateId} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[420px] overflow-y-auto sm:max-w-[420px]">
        {isLoading || !data ? (
          <div className="p-6 text-ink-muted">Loading…</div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>{data.candidate.name}</SheetTitle>
              <div className="text-caption text-ink-muted">
                {data.candidate.seniority ?? '—'} · applying for {app?.requisition_title ?? '—'}
              </div>
            </SheetHeader>

            <div className="space-y-5 px-4 py-4">
              <section>
                <h4 className="mb-2 text-eyebrow uppercase text-ink-muted">Pipeline stage</h4>
                <div className="flex flex-wrap gap-2">
                  {STAGES.map((s) => (
                    <Button
                      key={s.id}
                      size="sm"
                      variant={app?.stage === s.id ? 'default' : 'secondary'}
                      disabled={!canManage || terminal || move.isPending}
                      onClick={() => move.mutate(s.id)}
                    >
                      {s.label}
                    </Button>
                  ))}
                </div>
                {terminal && (
                  <p className="mt-2 text-caption text-ink-muted">
                    This candidate is {app?.status} and can no longer be moved.
                  </p>
                )}
              </section>

              <section>
                <h4 className="mb-2 text-eyebrow uppercase text-ink-muted">Contact</h4>
                <Row k="Email" v={data.candidate.contact?.email ?? '—'} />
                <Row k="Phone" v={data.candidate.contact?.phone ?? '—'} />
                <Row k="Source" v={data.candidate.source ?? '—'} />
              </section>

              <section>
                <h4 className="mb-2 text-eyebrow uppercase text-ink-muted">CV</h4>
                <div className="rounded border border-hairline bg-surface-2 px-3 py-2 text-caption text-ink-muted">
                  CV auto-fill coming soon.
                </div>
              </section>

              <section>
                <h4 className="mb-2 flex items-center gap-2 text-eyebrow uppercase text-ink-muted">
                  Skills
                  {fit && <Badge variant={fit.strong ? 'success' : 'secondary'}>{fit.text}</Badge>}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {data.skills.length === 0 ? (
                    <span className="text-caption text-ink-muted">No skills recorded.</span>
                  ) : (
                    data.skills.map((s) => (
                      <Badge key={s.skill_id} variant="outline">
                        <span>{s.skill_name}</span>
                        {s.level != null ? <span>{` · L${s.level}`}</span> : null}
                      </Badge>
                    ))
                  )}
                </div>
              </section>

              <section>
                <h4 className="mb-2 text-eyebrow uppercase text-ink-muted">Notes</h4>
                <p className="text-body text-ink">{data.candidate.note ?? '—'}</p>
              </section>

              <section>
                <h4 className="mb-2 text-eyebrow uppercase text-ink-muted">Interviews</h4>
                <p className="text-caption text-ink-muted">No interviews yet.</p>
              </section>

              <section>
                <h4 className="mb-2 text-eyebrow uppercase text-ink-muted">Activity</h4>
                <CandidateTimeline events={data.timeline} />
              </section>
            </div>

            <div className="flex justify-end gap-2 border-t border-hairline px-4 py-3">
              {canTransfer && !terminal && (
                <Button variant="secondary" onClick={() => setTransferOpen(true)}>
                  Move to another role
                </Button>
              )}
              {canReject && !terminal && (
                <Button variant="destructive" onClick={() => setRejectOpen(true)}>
                  Reject
                </Button>
              )}
            </div>

            {app && (
              <>
                <RejectDialog
                  applicationId={app.application_id}
                  version={app.version}
                  open={rejectOpen}
                  onOpenChange={setRejectOpen}
                  onDone={refresh}
                />
                <TransferDialog
                  applicationId={app.application_id}
                  version={app.version}
                  currentRequisitionId={app.requisition_id}
                  open={transferOpen}
                  onOpenChange={setTransferOpen}
                  onDone={() => {
                    refresh();
                    onClose();
                  }}
                />
              </>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-hairline py-1.5">
      <span className="text-ink-muted">{k}</span>
      <span className="text-ink">{v}</span>
    </div>
  );
}
