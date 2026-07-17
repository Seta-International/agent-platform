import {
  Avatar,
  Badge,
  Button,
  Dialog,
  DropdownMenu,
  DropdownMenuItem,
  formatRelative,
  IconButton,
  Layout,
  LayoutContent,
  useToast,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Cake,
  CalendarDays,
  Check,
  Copy,
  FileText,
  Globe,
  Mail,
  MoreHorizontal,
  Phone,
  RefreshCw,
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
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-primary">{title}</h3>
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
    <div className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-b-0">
      <span className="flex items-center gap-1.5 text-sm text-secondary">
        {icon}
        {label}
      </span>
      <span className="flex items-center gap-1.5 text-base text-primary">
        {value}
        {onCopy && (
          <IconButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCopy}
            label={`Copy ${label}`}
            icon={<Copy className="size-3.5" />}
          />
        )}
      </span>
    </div>
  );
}

function PipelineStepper({ stage }: { stage: CandStage | undefined }) {
  const curIdx = stage ? STAGES.findIndex((s) => s.id === stage) : -1;
  return (
    <div className="relative">
      <div className="absolute inset-x-[12.5%] top-[9px] h-px bg-border-strong" />
      <div
        className="absolute inset-y-0 left-[12.5%] top-[9px] h-px bg-accent-bg transition-[width]"
        style={{ width: curIdx <= 0 ? 0 : `${(curIdx / (STAGES.length - 1)) * 75}%` }}
      />
      <div className="relative flex justify-between">
        {STAGES.map((s, i) => {
          const reached = i <= curIdx;
          return (
            <div key={s.id} className="flex flex-col items-center gap-1.5">
              <span
                className={`flex size-[18px] items-center justify-center rounded-full text-on-accent ${
                  reached ? 'bg-accent-bg' : 'border-2 border-border-strong bg-body'
                }`}
              >
                {reached && <Check className="size-2.5" aria-hidden />}
              </span>
              <span
                className={`text-sm font-medium ${i === curIdx ? 'text-primary' : 'text-secondary'}`}
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
  const toast = useToast();
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
      toast({ body: 'Stage updated' });
      refresh();
    },
    onError: (e: Error) => on409(toast, e, queryClient, hiringKeys.candidate(candidateId ?? '')),
  });
  const terminal = app ? app.status !== 'active' : true;
  const fit = app ? fitLabel(app.fit) : null;
  const hasMoreActions = (canTransfer && !terminal) || (canReject && !terminal);
  const dialogLabel = `Candidate: ${data?.candidate.name ?? 'Loading'}`;

  return (
    <Dialog
      isOpen={!!candidateId}
      onOpenChange={(v) => !v && onClose()}
      purpose="info"
      width={1040}
      maxHeight="90vh"
      padding={0}
      aria-label={dialogLabel}
    >
      {/*
       * Special case (no visible header/footer): the content below renders its own visible
       * header (avatar/name/close button), so this shell must NOT render a `DialogHeader` —
       * that would stack two header bars. The dialog's accessible name is set directly via
       * `aria-label` above, mirroring the original's screen-reader-only `DialogTitle`.
       */}
      <Layout
        padding={0}
        content={
          <LayoutContent padding={0} isScrollable={false}>
            <div className="flex max-h-[90vh] flex-col">
              {isLoading || !data ? (
                <div className="p-6 text-secondary">Loading…</div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
                    <div className="flex items-start gap-3">
                      <Avatar name={data.candidate.name} size={60} />
                      <div>
                        <div className="text-2xl font-semibold text-primary">
                          {data.candidate.name}
                        </div>
                        <div className="text-base text-secondary">
                          {data.candidate.seniority ?? '—'} · applying for{' '}
                          {app?.requisition_title ?? '—'}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-sm text-secondary">
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
                        <DropdownMenu
                          placement="below"
                          button={{
                            variant: 'ghost',
                            size: 'sm',
                            isIconOnly: true,
                            icon: <MoreHorizontal className="size-4" />,
                            label: 'More actions',
                          }}
                        >
                          {canTransfer && !terminal && (
                            <DropdownMenuItem
                              label="Move to another role"
                              onClick={() => setTransferOpen(true)}
                            />
                          )}
                          {canReject && !terminal && (
                            <DropdownMenuItem
                              label="Reject"
                              style={{ color: 'var(--color-error)' }}
                              onClick={() => setRejectOpen(true)}
                            />
                          )}
                        </DropdownMenu>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        isIconOnly
                        icon={<X className="size-4" />}
                        label="Close"
                        onClick={onClose}
                      />
                    </div>
                  </div>

                  <div className="border-b border-border px-6 py-4">
                    <PipelineStepper stage={app?.stage} />
                    {terminal && (
                      <p className="mt-3 text-sm text-secondary">
                        This candidate is {app?.status} and can no longer be moved.
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3">
                    <DropdownMenu
                      placement="below"
                      hasChevron
                      button={{
                        variant: 'secondary',
                        size: 'sm',
                        label: 'Move stage',
                        icon: <RefreshCw className="size-3.5" aria-hidden />,
                        isDisabled: !canManage || terminal || move.isPending,
                      }}
                    >
                      {STAGES.map((s) => (
                        <DropdownMenuItem
                          key={s.id}
                          label={s.label}
                          isDisabled={app?.stage === s.id}
                          onClick={() => move.mutate(s.id)}
                        />
                      ))}
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
                                  void navigator.clipboard.writeText(
                                    data.candidate.contact?.phone ?? '',
                                  )
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
                          fit && (
                            <Badge variant={fit.strong ? 'success' : 'neutral'} label={fit.text} />
                          )
                        }
                      >
                        <div className="flex flex-wrap gap-1.5">
                          {data.skills.length === 0 ? (
                            <span className="text-sm text-secondary">No skills recorded.</span>
                          ) : (
                            data.skills.map((s) => (
                              <Badge
                                key={s.skill_id}
                                variant="neutral"
                                label={
                                  <>
                                    <span>{s.skill_name}</span>
                                    {s.level ? <span>{` · L${s.level}`}</span> : null}
                                  </>
                                }
                              />
                            ))
                          )}
                        </div>
                      </DetailCard>

                      <DetailCard title="CV">
                        <CandidateCvActions
                          candidateId={data.candidate.id}
                          hasCv={Boolean(data.candidate.cv_storage_key)}
                          cvStorageKey={data.candidate.cv_storage_key}
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
                          <p className="text-base text-primary">{app.note}</p>
                        ) : (
                          <p className="text-sm text-secondary">No notes yet.</p>
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
                              <span className="font-mono text-sm">{app.requisition_id}</span>
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
            </div>
          </LayoutContent>
        }
      />

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
  cvStorageKey,
  canManage,
  onChanged,
}: {
  candidateId: string;
  hasCv: boolean;
  cvStorageKey: string | null | undefined;
  canManage: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const download = useMutation({
    mutationFn: () => getCandidateCvDownloadUrl(candidateId),
    onSuccess: (url) => window.open(url, '_blank', 'noopener'),
    onError: (e: Error) => toast({ body: e.message, type: 'error' }),
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
      toast({ body: 'CV updated' });
      onChanged();
    },
    onError: (e: Error) => toast({ body: e.message, type: 'error' }),
  });

  const CV_MAX_BYTES = 10 * 1024 * 1024;
  function handleCvFile(file: File | undefined) {
    if (!file) return;
    if (file.size > CV_MAX_BYTES) {
      toast({ body: 'CV must be under 10MB', type: 'error' });
      return;
    }
    replace.mutate(file);
  }

  if (hasCv) {
    const filename = cvStorageKey ? cvStorageKey.split('/').pop() : 'CV.pdf';
    return (
      <div className="flex items-center justify-between gap-4 w-full">
        <button
          type="button"
          disabled={download.isPending}
          onClick={() => download.mutate()}
          className="flex flex-1 items-center gap-3 rounded-lg border border-border bg-body p-4 cursor-pointer text-left transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bg focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <div className="flex size-10 flex-none items-center justify-center rounded-lg bg-accent-bg/10 text-accent">
            <FileText className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-base font-semibold text-primary truncate hover:underline">
              {filename}
            </div>
          </div>
        </button>
        {canManage && (
          <label className="cursor-pointer text-base font-medium text-accent hover:underline flex-none">
            {replace.isPending ? 'Uploading…' : 'Replace'}
            <input
              type="file"
              accept=".pdf,.docx"
              className="hidden"
              disabled={replace.isPending}
              onChange={(e) => handleCvFile(e.target.files?.[0])}
            />
          </label>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 text-base">
      <span className="text-secondary">No CV on file</span>
      {canManage && (
        <label className="cursor-pointer text-accent hover:underline">
          {replace.isPending ? 'Uploading…' : 'Upload'}
          <input
            type="file"
            accept=".pdf,.docx"
            className="hidden"
            disabled={replace.isPending}
            onChange={(e) => handleCvFile(e.target.files?.[0])}
          />
        </label>
      )}
    </div>
  );
}
