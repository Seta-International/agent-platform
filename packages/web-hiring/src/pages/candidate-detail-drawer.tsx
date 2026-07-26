import {
  AlertDialog,
  Badge,
  Banner,
  Button,
  Dialog,
  DialogFooter,
  DialogHeader,
  DisabledActionTooltip,
  Layout,
  LayoutContent,
  Link,
  ProgressBar,
  Tooltip,
  useToast,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  ArrowRight,
  Building2,
  Cake,
  CalendarDays,
  CircleDot,
  FileText,
  Globe,
  Mail,
  Phone,
  Star,
  Upload,
  VenusAndMars,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import {
  type CandStage,
  editCandidate,
  fetchCandidate,
  fetchRequisition,
  getCandidateCvDownloadUrl,
  hireApplication,
  moveApplicationStage,
  putCvToS3,
  requestCandidateCvUpload,
} from '../api/hiring-client.ts';
import { fetchDirectoryUsersByIds } from '../api/identity-directory.ts';
import { hiringKeys } from '../state/query-keys.ts';
import { CandidateTimeline } from './candidate-timeline.tsx';
import { fitLabel } from './candidate-utils.ts';
import { DetailRow } from './detail-row.tsx';
import { RejectDialog } from './reject-dialog.tsx';
import { TransferDialog } from './transfer-dialog.tsx';
import { on409 } from './utils.ts';

const STAGES: { id: CandStage; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'screening', label: 'Screening' },
  { id: 'interview', label: 'Interview' },
  { id: 'offer', label: 'Offer' },
];

// Application lifecycle status → human label + Badge tone (chromatic colour is reserved for status).
// Rejected reads as a caution (amber, matching the terminal banner); hired is the positive outcome.
const APP_STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  hired: 'Hired',
  rejected: 'Rejected',
  transferred: 'Transferred',
  cancelled: 'Cancelled',
};
const APP_STATUS_VARIANT: Record<string, 'success' | 'warning' | 'neutral' | 'error'> = {
  active: 'neutral',
  hired: 'success',
  rejected: 'warning',
  transferred: 'neutral',
  cancelled: 'neutral',
};

// Gender is stored as a snake_case enum — show a human label instead of the raw value.
const GENDER_LABEL: Record<string, string> = {
  male: 'Male',
  female: 'Female',
  non_binary: 'Non-binary',
  other: 'Other',
  prefer_not_to_say: 'Prefer not to say',
};
function genderLabel(value: string | null): string {
  if (!value) return 'Not provided';
  return GENDER_LABEL[value] ?? value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
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

export function CandidateDetailDrawer({
  candidateId,
  onClose,
}: {
  candidateId: string | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const canManage = usePermission('hiring.candidate.manage');
  const canReject = usePermission('hiring.candidate.reject');
  const canTransfer = usePermission('hiring.candidate.transfer');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [confirmHire, setConfirmHire] = useState(false);
  const [confirmAdvance, setConfirmAdvance] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: hiringKeys.candidate(candidateId ?? ''),
    queryFn: () => fetchCandidate(candidateId as string),
    enabled: !!candidateId,
  });

  // Resolve the timeline's actor_user_ids to display names via the identity directory — hiring
  // stores only the id, so "by <name>" attribution needs this cross-module lookup.
  const actorIds = useMemo(
    () =>
      [
        ...new Set(
          (data?.timeline ?? [])
            .map((e) => e.actor_user_id)
            .filter((id): id is string => id !== null),
        ),
      ].sort(),
    [data?.timeline],
  );
  const { data: directoryUsers } = useQuery({
    queryKey: hiringKeys.actorNames(actorIds),
    queryFn: () => fetchDirectoryUsersByIds(actorIds),
    enabled: actorIds.length > 0,
  });
  const actorNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of directoryUsers ?? []) map[u.user_id] = u.name;
    return map;
  }, [directoryUsers]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: hiringKeys.candidate(candidateId ?? '') });
    void queryClient.invalidateQueries({ queryKey: hiringKeys.candidates() });
    void queryClient.invalidateQueries({ queryKey: hiringKeys.candidateStageCounts() });
    // A stage move / hire / reject / transfer also changes what the requisition detail's
    // applicant list and the requisitions board show — refresh those too. The `requisition`
    // prefix invalidates whichever requisition detail is open (incl. a transfer's new role).
    void queryClient.invalidateQueries({ queryKey: [...hiringKeys.all, 'requisition'] });
    void queryClient.invalidateQueries({ queryKey: hiringKeys.requisitions() });
  };

  const app = data?.applications.find((a) => a.status === 'active') ?? data?.applications[0];

  // The candidate payload carries only the fit counts (met/required), not which skills the
  // requisition asks for. Fetch the requisition so the fit badge can list them on hover.
  const { data: requisition } = useQuery({
    queryKey: hiringKeys.requisition(app?.requisition_id ?? ''),
    queryFn: () => fetchRequisition(app?.requisition_id as string),
    enabled: !!app?.requisition_id && app.fit.required > 0,
  });
  const requiredSkills = requisition?.skills ?? [];

  const move = useMutation({
    mutationFn: (to: CandStage) => {
      if (!app) throw new Error('no active application');
      return moveApplicationStage(app.application_id, { expected_version: app.version, to });
    },
    onSuccess: () => {
      setConfirmAdvance(false);
      toast({ body: 'Stage updated' });
      refresh();
    },
    onError: (e: Error) => {
      setConfirmAdvance(false);
      on409(toast, e, queryClient, hiringKeys.candidate(candidateId ?? ''));
    },
  });
  // Hiring fills the requisition and locks the application — terminal, so always confirm first.
  const hire = useMutation({
    mutationFn: () => {
      if (!app) throw new Error('no active application');
      return hireApplication(app.application_id, { expected_version: app.version });
    },
    onSuccess: () => {
      setConfirmHire(false);
      toast({ body: 'Candidate hired successfully' });
      refresh();
      void queryClient.invalidateQueries({ queryKey: hiringKeys.requisitions() });
      onClose();
    },
    onError: (e: Error) => {
      setConfirmHire(false);
      on409(toast, e, queryClient, hiringKeys.candidate(candidateId ?? ''));
      onClose();
    },
  });
  const terminal = app ? app.status !== 'active' : true;
  // FUT-559 on-hold lock: while the requisition is paused, its candidates can't be moved or
  // hired — resume the requisition first. (Terminal applications are already locked above.)
  const reqOnHold = !terminal && app?.requisition_status === 'on_hold';
  const fit = app ? fitLabel(app.fit) : null;
  const dialogLabel = `Candidate: ${data?.candidate.name ?? 'Loading'}`;

  // Decision-first: the common move is "advance to the next stage"; past Offer that becomes the
  // terminal Hire (its own confirm). Move stage (any stage) stays available in a secondary menu.
  const stageIdx = app?.stage ? STAGES.findIndex((s) => s.id === app.stage) : -1;
  const nextStage = stageIdx >= 0 && stageIdx < STAGES.length - 1 ? STAGES[stageIdx + 1] : null;
  const canAct = canManage && !terminal && !reqOnHold && !move.isPending;
  const advanceLabel = nextStage ? `Advance to ${nextStage.label}` : 'Mark as hired';
  // Every forward move now confirms first: a next-stage advance opens its own dialog; the final
  // step past Offer is the terminal Hire, which already has one.
  const advance = () => (nextStage ? setConfirmAdvance(true) : setConfirmHire(true));

  return (
    <Dialog
      isOpen={!!candidateId}
      onOpenChange={(v) => !v && onClose()}
      purpose="info"
      width={1040}
      maxHeight="90vh"
      aria-label={dialogLabel}
    >
      {isLoading || !data ? (
        <Layout
          content={
            <LayoutContent>
              <div className="p-6 text-secondary">Loading…</div>
            </LayoutContent>
          }
        />
      ) : (
        <Layout
          header={
            <DialogHeader
              title={data.candidate.name}
              subtitle={data.candidate.seniority ?? undefined}
              onOpenChange={(open) => !open && onClose()}
            />
          }
          content={
            <LayoutContent>
              {/* Terminal / on-hold states show a full-width alert; the current stage itself now
                  lives in the Application card (right column, with the rest of the process info). */}
              {terminal && (
                <Banner
                  className="mb-4"
                  // hired reads as a positive outcome (green); rejected is a caution (amber); the
                  // remaining closed states (cancelled/transferred) stay neutral info.
                  status={
                    app?.status === 'hired'
                      ? 'success'
                      : app?.status === 'rejected'
                        ? 'warning'
                        : 'info'
                  }
                  title={
                    app?.status === 'cancelled'
                      ? app?.requisition_status === 'filled'
                        ? 'Closed — the position was filled.'
                        : 'Closed — its requisition was cancelled.'
                      : `This candidate is ${app?.status} and can no longer be moved.`
                  }
                />
              )}
              {reqOnHold && (
                <Banner
                  className="mb-4"
                  status="warning"
                  title="Requisition on hold — resume it from the board to move this candidate."
                />
              )}

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
                {/* LEFT — the person: contact, résumé, skills. */}
                <div className="space-y-4">
                  <DetailCard title="Contact">
                    <DetailRow
                      icon={<Mail className="size-3.5" aria-hidden />}
                      label="Email"
                      value={data.candidate.contact?.personal_email ?? 'Not provided'}
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
                      value={data.candidate.contact?.phone ?? 'Not provided'}
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
                      value={data.candidate.source ?? 'Not provided'}
                    />
                    <DetailRow
                      icon={<Cake className="size-3.5" aria-hidden />}
                      label="Date of birth"
                      value={data.candidate.dob ?? 'Not provided'}
                    />
                    <DetailRow
                      icon={<VenusAndMars className="size-3.5" aria-hidden />}
                      label="Gender"
                      value={genderLabel(data.candidate.gender)}
                    />
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

                  <DetailCard title="Skills">
                    {app && app.fit.required > 0 && (
                      <div className="mb-3 flex items-center gap-2">
                        <Tooltip
                          content={
                            requiredSkills.length > 0 ? (
                              <div className="flex flex-col gap-0.5">
                                {requiredSkills.map((s) => (
                                  <span key={s.skill_name}>
                                    {s.skill_name}
                                    {s.min_level ? ` · ${s.min_level}/5` : ''}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              'Loading required skills…'
                            )
                          }
                        >
                          <Badge
                            variant={fit?.strong ? 'success' : 'neutral'}
                            label={fit?.text ?? ''}
                          />
                        </Tooltip>
                        <span className="text-sm text-secondary">
                          {fit?.strong ? 'Strong fit' : 'Partial fit'} for the required skills
                        </span>
                      </div>
                    )}
                    {data.skills.length === 0 ? (
                      <p className="text-sm text-secondary">No skills listed.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {data.skills.map((s) => (
                          <span
                            key={s.skill_id}
                            className="rounded-full bg-surface px-2.5 py-1 text-sm text-secondary"
                          >
                            {s.skill_name}
                            {s.level ? ` · ${s.level}/5` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </DetailCard>

                  <DetailCard title="Notes">
                    {app?.note ? (
                      <p className="text-base text-primary">{app.note}</p>
                    ) : (
                      <p className="text-sm text-secondary">No notes yet.</p>
                    )}
                  </DetailCard>
                </div>

                {/* RIGHT — the application & its progress: role, screening, history. */}
                <div className="space-y-4">
                  <DetailCard title="Application">
                    {/* Current stage + progress lead the process card. */}
                    <div className="mb-3 border-b border-border pb-3">
                      <div className="text-sm text-secondary">Current stage</div>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="text-lg font-semibold text-primary">
                          {app ? (STAGES.find((s) => s.id === app.stage)?.label ?? app.stage) : '—'}
                        </span>
                        {stageIdx >= 0 && (
                          <span className="text-sm text-secondary">
                            Step {stageIdx + 1} of {STAGES.length}
                          </span>
                        )}
                      </div>
                      {stageIdx >= 0 && (
                        <div className="mt-2">
                          <ProgressBar
                            label="Stage progress"
                            isLabelHidden
                            value={stageIdx + 1}
                            max={STAGES.length}
                          />
                        </div>
                      )}
                    </div>
                    <DetailRow
                      icon={<CircleDot className="size-3.5" aria-hidden />}
                      label="Status"
                      value={
                        app ? (
                          <Badge
                            variant={APP_STATUS_VARIANT[app.status] ?? 'neutral'}
                            label={APP_STATUS_LABEL[app.status] ?? app.status}
                          />
                        ) : (
                          '—'
                        )
                      }
                    />
                    <DetailRow
                      icon={<Building2 className="size-3.5" aria-hidden />}
                      label="Requisition"
                      value={
                        app ? (
                          <Link
                            onClick={() =>
                              void navigate({
                                to: '/hiring/requisitions',
                                search: (prev: Record<string, unknown>) => ({
                                  ...prev,
                                  selectedRequisitionId: app.requisition_id,
                                }),
                              })
                            }
                          >
                            {app.requisition_title}
                          </Link>
                        ) : (
                          '—'
                        )
                      }
                    />
                    <DetailRow
                      icon={<CalendarDays className="size-3.5" aria-hidden />}
                      label="Applied"
                      value={
                        app
                          ? new Date(app.applied_at).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })
                          : '—'
                      }
                    />
                    <DetailRow
                      icon={<Star className="size-3.5" aria-hidden />}
                      label="Rating"
                      value={app?.rating != null ? `${app.rating}/5` : 'Not rated'}
                    />
                  </DetailCard>

                  <DetailCard title="Activity timeline">
                    <CandidateTimeline events={data.timeline} actorNames={actorNames} />
                  </DetailCard>
                </div>
              </div>
            </LayoutContent>
          }
          footer={
            // A terminal application (hired/rejected/cancelled) keeps the decision bar visible for
            // continuity, but every action is locked — the outcome is already settled.
            <DialogFooter
              startContent={
                canTransfer ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    label="Move to another role"
                    isDisabled={terminal}
                    onClick={() => setTransferOpen(true)}
                  />
                ) : undefined
              }
            >
              {canReject && (
                <DisabledActionTooltip
                  disabled={reqOnHold}
                  reason="Requisition on hold — resume it from the board to reject this candidate."
                >
                  <Button
                    variant="secondary"
                    size="sm"
                    label="Reject"
                    style={{ color: 'var(--color-text-red)' }}
                    isDisabled={reqOnHold || terminal}
                    onClick={() => setRejectOpen(true)}
                  />
                </DisabledActionTooltip>
              )}
              <Button
                variant="primary"
                size="sm"
                label={advanceLabel}
                icon={<ArrowRight className="size-4" aria-hidden />}
                isDisabled={!canAct}
                onClick={advance}
              />
            </DialogFooter>
          }
        />
      )}

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
          <AlertDialog
            isOpen={confirmAdvance}
            onOpenChange={setConfirmAdvance}
            title={nextStage ? `Advance to ${nextStage.label}?` : 'Advance candidate?'}
            description={`This moves ${data?.candidate.name ?? 'the candidate'} to the ${
              nextStage?.label ?? 'next'
            } stage.`}
            cancelLabel="Cancel"
            actionLabel={move.isPending ? 'Advancing…' : 'Advance'}
            actionVariant="primary"
            isActionLoading={move.isPending}
            onAction={() => nextStage && move.mutate(nextStage.id)}
          />
          <AlertDialog
            isOpen={confirmHire}
            onOpenChange={setConfirmHire}
            title="Hire Candidate"
            description={`Are you sure you want to hire ${data?.candidate.name ?? 'this candidate'}? This will transition the candidate to Hired and automatically create a preboarding worker record in the People module.`}
            cancelLabel="Cancel"
            actionLabel={hire.isPending ? 'Hiring…' : 'Confirm'}
            actionVariant="primary"
            isActionLoading={hire.isPending}
            onAction={() => hire.mutate()}
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

  if (!canManage) {
    return <p className="text-sm text-secondary">No CV on file yet.</p>;
  }

  return (
    <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong bg-surface px-4 py-6 text-center transition-colors hover:border-accent-bg hover:bg-card focus-within:border-accent-bg focus-within:bg-card">
      <span className="flex size-10 items-center justify-center rounded-full bg-accent-bg/10 text-accent">
        <Upload className="size-5" aria-hidden />
      </span>
      <span className="text-base font-medium text-primary">
        {replace.isPending ? 'Uploading…' : 'Upload a CV'}
      </span>
      <span className="text-sm text-secondary">PDF or DOCX, up to 10 MB</span>
      <input
        type="file"
        accept=".pdf,.docx"
        className="hidden"
        disabled={replace.isPending}
        onChange={(e) => handleCvFile(e.target.files?.[0])}
      />
    </label>
  );
}
