import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  formatRelative,
  toast,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Cake,
  CalendarDays,
  Check,
  ChevronDown,
  Copy,
  Globe,
  Mail,
  MoreHorizontal,
  Phone,
  RefreshCw,
  User,
  VenusAndMars,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  type CandStage,
  editCandidate,
  fetchCandidate,
  getCandidateCvDownloadUrl,
  moveApplicationStage,
  putCvToS3,
  requestCandidateCvUpload,
} from '../api/hiring-client.ts';
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

function appliedLabel(appliedAt: string): string {
  const rel = formatRelative(appliedAt);
  return rel === 'now' ? 'just now' : `${rel} ago`;
}

function DetailCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-hairline bg-surface-1 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-body-sm font-semibold text-ink">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function DetailRow({
  icon,
  label,
  value,
  onCopy,
}: {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
  onCopy?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-hairline py-2 last:border-b-0">
      <span className="flex items-center gap-1.5 text-caption text-ink-muted">
        {icon}
        {label}
      </span>
      <span className="flex items-center gap-1.5 text-body-sm text-ink">
        {value}
        {onCopy && (
          <button
            type="button"
            onClick={onCopy}
            aria-label={`Copy ${label}`}
            className="text-ink-subtle hover:text-ink"
          >
            <Copy className="size-3.5" />
          </button>
        )}
      </span>
    </div>
  );
}

function PipelineStepper({ stage }: { stage: CandStage | undefined }) {
  const curIdx = stage ? STAGES.findIndex((s) => s.id === stage) : -1;
  return (
    <div className="relative">
      <div className="absolute inset-x-[12.5%] top-[9px] h-px bg-hairline-strong" />
      <div
        className="absolute inset-y-0 left-[12.5%] top-[9px] h-px bg-primary transition-[width]"
        style={{ width: curIdx <= 0 ? 0 : `${(curIdx / (STAGES.length - 1)) * 75}%` }}
      />
      <div className="relative flex justify-between">
        {STAGES.map((s, i) => {
          const reached = i <= curIdx;
          return (
            <div key={s.id} className="flex flex-col items-center gap-1.5">
              <span
                className={`flex size-[18px] items-center justify-center rounded-full text-on-primary ${
                  reached ? 'bg-primary' : 'border-2 border-hairline-strong bg-canvas'
                }`}
              >
                {reached && <Check className="size-2.5" aria-hidden />}
              </span>
              <span
                className={`text-caption font-medium ${i === curIdx ? 'text-ink' : 'text-ink-subtle'}`}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
    mutationFn: (to: CandStage) => {
      if (!app) throw new Error('no active application');
      return moveApplicationStage(app.application_id, { expected_version: app.version, to });
    },
    onSuccess: () => {
      toast.success('Stage updated');
      refresh();
    },
    onError: (e: Error) => on409(e, queryClient, hiringKeys.candidate(candidateId ?? '')),
  });
  const terminal = app ? app.status !== 'active' : true;
  const fit = app ? fitLabel(app.fit) : null;
  const hasMoreActions = (canTransfer && !terminal) || (canReject && !terminal);

  return (
    <Dialog open={!!candidateId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        hideClose
        unstyled
        className="flex max-h-[90vh] w-[min(1040px,94vw)] flex-col overflow-hidden rounded-xl p-0"
      >
        <DialogTitle className="sr-only">
          Candidate: {data?.candidate.name ?? 'Loading'}
        </DialogTitle>
        {isLoading || !data ? (
          <div className="p-6 text-ink-muted">Loading…</div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4 border-b border-hairline px-6 py-5">
              <div className="flex items-start gap-3">
                <Avatar className="size-14">
                  <AvatarFallback>
                    <User className="size-6" />
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="text-card-title font-semibold text-ink">
                    {data.candidate.name}
                  </div>
                  <div className="text-body-sm text-ink-muted">
                    {data.candidate.seniority ?? '—'} · applying for {app?.requisition_title ?? '—'}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-caption text-ink-subtle">
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="size-3.5" aria-hidden />
                      {data.candidate.source ?? '—'}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="size-3.5" aria-hidden />
                      {app ? `Applied ${appliedLabel(app.applied_at)}` : '—'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-none items-center gap-1">
                {hasMoreActions && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="More actions">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canTransfer && !terminal && (
                        <DropdownMenuItem onSelect={() => setTransferOpen(true)}>
                          Move to another role
                        </DropdownMenuItem>
                      )}
                      {canReject && !terminal && (
                        <DropdownMenuItem
                          className="text-destructive"
                          onSelect={() => setRejectOpen(true)}
                        >
                          Reject
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
                  <X className="size-4" />
                </Button>
              </div>
            </div>

            <div className="border-b border-hairline px-6 py-4">
              <PipelineStepper stage={app?.stage} />
              {terminal && (
                <p className="mt-3 text-caption text-ink-muted">
                  This candidate is {app?.status} and can no longer be moved.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-6 py-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!canManage || terminal || move.isPending}
                  >
                    <RefreshCw className="size-3.5" aria-hidden />
                    Move stage
                    <ChevronDown className="size-3.5" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {STAGES.map((s) => (
                    <DropdownMenuItem
                      key={s.id}
                      disabled={app?.stage === s.id}
                      onSelect={() => move.mutate(s.id)}
                    >
                      {s.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto px-6 py-4 lg:grid-cols-[1.4fr_1fr]">
              <div className="space-y-4">
                <DetailCard title="Contact">
                  <DetailRow
                    icon={<Mail className="size-3.5" aria-hidden />}
                    label="Personal email"
                    value={data.candidate.contact?.personal_email ?? '—'}
                    onCopy={
                      data.candidate.contact?.personal_email
                        ? () =>
                            void navigator.clipboard.writeText(
                              data.candidate.contact?.personal_email ?? '',
                            )
                        : undefined
                    }
                  />
                  <DetailRow
                    icon={<Phone className="size-3.5" aria-hidden />}
                    label="Phone"
                    value={data.candidate.contact?.phone ?? '—'}
                    onCopy={
                      data.candidate.contact?.phone
                        ? () =>
                            void navigator.clipboard.writeText(data.candidate.contact?.phone ?? '')
                        : undefined
                    }
                  />
                  <DetailRow
                    icon={<Globe className="size-3.5" aria-hidden />}
                    label="Source"
                    value={data.candidate.source ?? '—'}
                  />
                  <DetailRow
                    icon={<Cake className="size-3.5" aria-hidden />}
                    label="Date of birth"
                    value={data.candidate.dob ?? '—'}
                  />
                  <DetailRow
                    icon={<VenusAndMars className="size-3.5" aria-hidden />}
                    label="Gender"
                    value={data.candidate.gender ?? '—'}
                  />
                </DetailCard>

                <DetailCard
                  title="Skills"
                  action={
                    fit && <Badge variant={fit.strong ? 'success' : 'secondary'}>{fit.text}</Badge>
                  }
                >
                  <div className="flex flex-wrap gap-1.5">
                    {data.skills.length === 0 ? (
                      <span className="text-caption text-ink-muted">No skills recorded.</span>
                    ) : (
                      data.skills.map((s) => (
                        <Badge key={s.skill_id} variant="secondary">
                          <span>{s.skill_name}</span>
                          {s.level ? <span>{` · L${s.level}`}</span> : null}
                        </Badge>
                      ))
                    )}
                  </div>
                </DetailCard>

                <DetailCard title="Resume / CV">
                  <CandidateCvActions
                    candidateId={data.candidate.id}
                    hasCv={Boolean(data.candidate.cv_storage_key)}
                    canManage={canManage}
                    onChanged={() =>
                      void queryClient.invalidateQueries({
                        queryKey: hiringKeys.candidate(data.candidate.id),
                      })
                    }
                  />
                </DetailCard>

                <DetailCard title="Notes">
                  {app?.note ? (
                    <p className="text-body-sm text-ink">{app.note}</p>
                  ) : (
                    <p className="text-caption text-ink-muted">No notes yet.</p>
                  )}
                </DetailCard>
              </div>

              <div className="space-y-4">
                <DetailCard title="Application details">
                  <DetailRow label="Requisition" value={app?.requisition_title ?? '—'} />
                  <DetailRow
                    label="Requisition ID"
                    value={
                      app ? (
                        <span className="font-mono text-caption">{app.requisition_id}</span>
                      ) : (
                        '—'
                      )
                    }
                  />
                  <DetailRow
                    label="Applied date"
                    value={app ? new Date(app.applied_at).toLocaleString() : '—'}
                  />
                  <DetailRow
                    label="Current stage"
                    value={app ? STAGES.find((s) => s.id === app.stage)?.label : '—'}
                  />
                  <DetailRow
                    label="Rating"
                    value={app?.rating != null ? `${app.rating}/5` : 'Not rated'}
                  />
                </DetailCard>

                <DetailCard title="Activity timeline">
                  <CandidateTimeline events={data.timeline} />
                </DetailCard>
              </div>
            </div>
          </>
        )}
      </DialogContent>

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
    </Dialog>
  );
}

function CandidateCvActions({
  candidateId,
  hasCv,
  canManage,
  onChanged,
}: {
  candidateId: string;
  hasCv: boolean;
  canManage: boolean;
  onChanged: () => void;
}) {
  const download = useMutation({
    mutationFn: () => getCandidateCvDownloadUrl(candidateId),
    onSuccess: (url) => window.open(url, '_blank', 'noopener'),
    onError: (e: Error) => toast.error(e.message),
  });

  const replace = useMutation({
    mutationFn: async (file: File) => {
      const { upload_url, s3_key } = await requestCandidateCvUpload(
        candidateId,
        file.name,
        file.type || 'application/octet-stream',
      );
      await putCvToS3(upload_url, file);
      await editCandidate(candidateId, { patch: { cv_storage_key: s3_key } });
    },
    onSuccess: () => {
      toast.success('CV updated');
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex items-center gap-3 text-body-sm">
      {hasCv ? (
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0"
          disabled={download.isPending}
          onClick={() => download.mutate()}
        >
          Download CV
        </Button>
      ) : (
        <span className="text-ink-muted">No CV on file</span>
      )}
      {canManage && (
        <label className="cursor-pointer text-primary hover:underline">
          {replace.isPending ? 'Uploading…' : hasCv ? 'Replace' : 'Upload'}
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
    </div>
  );
}
