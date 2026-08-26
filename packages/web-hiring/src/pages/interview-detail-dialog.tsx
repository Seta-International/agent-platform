import {
  Avatar,
  Badge,
  Banner,
  Button,
  Dialog,
  DialogFooter,
  DialogHeader,
  DropdownMenu,
  DropdownMenuItem,
  Layout,
  LayoutContent,
  Link,
  SegmentedControl,
  SegmentedControlItem,
  SkillLevelRating,
  Text,
  Textarea,
  VStack,
} from '@seta/shared-ui';
import {
  Briefcase,
  Building2,
  CalendarDays,
  MoreHorizontal,
  UserX,
  Video,
  XCircle,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { DetailRow } from './detail-row.tsx';
import {
  formatDayAndTime,
  type Interview,
  type InterviewRecommendation,
  type InterviewResult,
  RECOMMENDATION_LABEL,
  RESULT_BADGE_VARIANT,
  RESULT_LABEL,
  STATUS_LABEL,
} from './interview-utils.ts';

function DetailCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-base font-semibold text-primary">{title}</h3>
      {children}
    </section>
  );
}

function OutcomeReasonDialog({
  isOpen,
  kind,
  onOpenChange,
  onConfirm,
}: {
  isOpen: boolean;
  kind: 'cancelled' | 'no_show';
  onOpenChange: (v: boolean) => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const title = kind === 'cancelled' ? 'Cancel interview' : 'Mark as no-show';
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(v) => {
        if (!v) setReason('');
        onOpenChange(v);
      }}
      purpose="required"
    >
      <Layout
        header={<DialogHeader title={title} onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
            <Textarea
              label="Reason"
              isOptional
              value={reason}
              onChange={setReason}
              placeholder={
                kind === 'cancelled'
                  ? 'Reschedule needed, candidate withdrew…'
                  : 'No response on the call, no message sent…'
              }
              rows={3}
            />
          </LayoutContent>
        }
        footer={
          <DialogFooter>
            <Button variant="secondary" label="Back" onClick={() => onOpenChange(false)} />
            <Button
              variant="destructive"
              label={title}
              onClick={() => {
                onConfirm(reason.trim());
                setReason('');
              }}
            />
          </DialogFooter>
        }
      />
    </Dialog>
  );
}

export function InterviewDetailDialog({
  interview,
  onClose,
  onUpdate,
  onReschedule,
}: {
  interview: Interview | null;
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<Interview>) => void;
  onReschedule: (candidateId: string) => void;
}) {
  // Draft outcome state resets whenever a different interview opens — the adjust-during-render
  // pattern below (no effect needed) keeps it in sync without ever showing a stale draft.
  const [formFor, setFormFor] = useState<string | null>(null);
  const [result, setResult] = useState<InterviewResult>('pass');
  const [rating, setRating] = useState<number | null>(4);
  const [recommendation, setRecommendation] = useState<InterviewRecommendation>('hire');
  const [feedbackNote, setFeedbackNote] = useState('');
  const [editingOutcome, setEditingOutcome] = useState(false);
  const [reasonDialog, setReasonDialog] = useState<'cancelled' | 'no_show' | null>(null);

  if (interview && formFor !== interview.id) {
    setFormFor(interview.id);
    setResult(interview.result ?? 'pass');
    setRating(interview.rating ?? 4);
    setRecommendation(interview.recommendation ?? 'hire');
    setFeedbackNote(interview.feedback_note ?? '');
    setEditingOutcome(false);
    setReasonDialog(null);
  }

  const isRecording = interview?.status === 'scheduled';
  const isEditing = interview?.status === 'completed' && editingOutcome;
  const showsForm = isRecording || isEditing;

  function saveOutcome() {
    if (!interview) return;
    onUpdate(interview.id, {
      status: 'completed',
      result,
      rating,
      recommendation,
      feedback_note: feedbackNote.trim(),
    });
    setEditingOutcome(false);
  }

  return (
    <>
      <Dialog
        isOpen={!!interview}
        onOpenChange={(v) => !v && onClose()}
        purpose="info"
        width={640}
        maxHeight="90vh"
        aria-label={interview ? `Interview: ${interview.candidate_name}` : 'Interview'}
      >
        {interview && (
          <Layout
            header={
              <DialogHeader
                title={interview.candidate_name}
                subtitle={`${interview.round} round · ${interview.requisition_title}`}
                onOpenChange={(open) => !open && onClose()}
              />
            }
            content={
              <LayoutContent>
                <VStack gap={4}>
                  {interview.status === 'cancelled' && (
                    <Banner
                      status="warning"
                      title="This interview was cancelled."
                      description={interview.outcome_reason || undefined}
                    />
                  )}
                  {interview.status === 'no_show' && (
                    <Banner
                      status="warning"
                      title="The candidate didn't show up."
                      description={interview.outcome_reason || undefined}
                    />
                  )}

                  <DetailCard title="Schedule">
                    <DetailRow
                      icon={<CalendarDays className="size-3.5" aria-hidden />}
                      label="When"
                      value={`${formatDayAndTime(interview.scheduled_at)} · ${interview.duration_minutes} min`}
                    />
                    <DetailRow
                      icon={
                        interview.mode === 'online' ? (
                          <Video className="size-3.5" aria-hidden />
                        ) : (
                          <Building2 className="size-3.5" aria-hidden />
                        )
                      }
                      label="Mode"
                      value={
                        interview.mode === 'online' ? (
                          interview.meeting_link ? (
                            <Link href={interview.meeting_link} target="_blank" rel="noreferrer">
                              Join meeting
                            </Link>
                          ) : (
                            'Online'
                          )
                        ) : (
                          'Onsite'
                        )
                      }
                    />
                    <DetailRow
                      icon={<Briefcase className="size-3.5" aria-hidden />}
                      label="Position"
                      value={interview.requisition_title}
                    />
                  </DetailCard>

                  <DetailCard title="Panel">
                    {interview.panel.length ? (
                      <div className="flex flex-wrap gap-3">
                        {interview.panel.map((p) => (
                          <div key={p.user_id} className="flex items-center gap-2">
                            <Avatar name={p.display_name} size={24} />
                            <Text size="sm">{p.display_name}</Text>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Text color="secondary" size="sm">
                        No panel assigned.
                      </Text>
                    )}
                  </DetailCard>

                  <DetailCard title="Note">
                    <Text color={interview.note ? 'primary' : 'secondary'} size="sm">
                      {interview.note || 'No notes yet.'}
                    </Text>
                  </DetailCard>

                  <DetailCard title="Outcome">
                    {showsForm ? (
                      <VStack gap={3}>
                        <VStack gap={2}>
                          <Text size="sm" weight="medium">
                            Result
                          </Text>
                          <SegmentedControl
                            label="Result"
                            value={result}
                            onChange={(v) => setResult(v as InterviewResult)}
                          >
                            <SegmentedControlItem value="pass" label="Pass" />
                            <SegmentedControlItem value="hold" label="Hold" />
                            <SegmentedControlItem value="fail" label="Fail" />
                          </SegmentedControl>
                        </VStack>
                        <VStack gap={2}>
                          <Text size="sm" weight="medium">
                            Overall rating
                          </Text>
                          <SkillLevelRating level={rating} onChange={setRating} />
                        </VStack>
                        <VStack gap={2}>
                          <Text size="sm" weight="medium">
                            Recommendation
                          </Text>
                          <SegmentedControl
                            label="Recommendation"
                            value={recommendation}
                            onChange={(v) => setRecommendation(v as InterviewRecommendation)}
                          >
                            <SegmentedControlItem value="hire" label="Hire" />
                            <SegmentedControlItem value="next_round" label="Next round" />
                            <SegmentedControlItem value="no_hire" label="Don't hire" />
                          </SegmentedControl>
                        </VStack>
                        <Textarea
                          label="Feedback — strengths & concerns"
                          isOptional
                          rows={3}
                          value={feedbackNote}
                          onChange={setFeedbackNote}
                          placeholder="What stood out, gaps, evidence…"
                        />
                      </VStack>
                    ) : interview.status === 'completed' ? (
                      <VStack gap={3}>
                        <div className="flex flex-wrap items-center gap-3">
                          <Badge
                            variant={
                              interview.result ? RESULT_BADGE_VARIANT[interview.result] : 'neutral'
                            }
                            label={
                              interview.result ? RESULT_LABEL[interview.result] : 'Not recorded'
                            }
                          />
                          <SkillLevelRating level={interview.rating ?? null} />
                          {interview.recommendation && (
                            <Text size="sm" color="secondary">
                              {RECOMMENDATION_LABEL[interview.recommendation]}
                            </Text>
                          )}
                        </div>
                        <Text size="sm" color={interview.feedback_note ? 'primary' : 'secondary'}>
                          {interview.feedback_note || 'No feedback notes.'}
                        </Text>
                      </VStack>
                    ) : (
                      <Text color="secondary" size="sm">
                        No outcome to record — {STATUS_LABEL[interview.status].toLowerCase()}.
                      </Text>
                    )}
                  </DetailCard>
                </VStack>
              </LayoutContent>
            }
            footer={
              <DialogFooter
                startContent={
                  isRecording ? (
                    <DropdownMenu
                      placement="above"
                      button={{
                        variant: 'ghost',
                        size: 'sm',
                        icon: <MoreHorizontal className="size-4" />,
                        isIconOnly: true,
                        label: 'More actions',
                      }}
                    >
                      <DropdownMenuItem
                        label="Mark as no-show"
                        icon={<UserX className="size-4" />}
                        onClick={() => setReasonDialog('no_show')}
                      />
                      <DropdownMenuItem
                        label="Cancel interview"
                        icon={<XCircle className="size-4" />}
                        onClick={() => setReasonDialog('cancelled')}
                      />
                    </DropdownMenu>
                  ) : undefined
                }
              >
                {showsForm ? (
                  <>
                    {isEditing && (
                      <Button
                        variant="secondary"
                        label="Discard changes"
                        onClick={() => setEditingOutcome(false)}
                      />
                    )}
                    <Button
                      variant="primary"
                      label={isEditing ? 'Save changes' : 'Save outcome'}
                      onClick={saveOutcome}
                    />
                  </>
                ) : interview.status === 'completed' ? (
                  <Button
                    variant="secondary"
                    label="Edit outcome"
                    onClick={() => setEditingOutcome(true)}
                  />
                ) : (
                  <Button
                    variant="primary"
                    label="Schedule again"
                    onClick={() => {
                      onReschedule(interview.candidate_id);
                      onClose();
                    }}
                  />
                )}
              </DialogFooter>
            }
          />
        )}
      </Dialog>
      {interview && reasonDialog && (
        <OutcomeReasonDialog
          isOpen={!!reasonDialog}
          kind={reasonDialog}
          onOpenChange={(v) => !v && setReasonDialog(null)}
          onConfirm={(reason) => {
            onUpdate(interview.id, { status: reasonDialog, outcome_reason: reason });
            setReasonDialog(null);
            onClose();
          }}
        />
      )}
    </>
  );
}
