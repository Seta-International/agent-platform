import {
  Avatar,
  Badge,
  Banner,
  Button,
  Dialog,
  DialogFooter,
  DialogHeader,
  Field,
  Layout,
  LayoutContent,
  Link,
  SegmentedControl,
  SegmentedControlItem,
  Text,
  Textarea,
  VStack,
} from '@seta/shared-ui';
import { Briefcase, Building2, CalendarDays, Star, UserX, Video, XCircle } from 'lucide-react';
import { useId, useState } from 'react';
import { DetailRow } from './detail-row.tsx';
import {
  formatDayAndTime,
  type Interview,
  type InterviewRecommendation,
  type InterviewResult,
  RECOMMENDATION_LABEL,
  RESULT_BADGE_VARIANT,
  RESULT_LABEL,
  ROUND_LABEL,
  STATUS_LABEL,
} from './interview-utils.ts';
import { StarRating } from './star-rating.tsx';

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
  const resultFieldId = useId();
  const ratingFieldId = useId();
  const recommendationFieldId = useId();

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
        width={900}
        maxHeight="90vh"
        aria-label={interview ? `Interview: ${interview.candidate_name}` : 'Interview'}
      >
        {interview && (
          <Layout
            header={
              <DialogHeader
                title={interview.candidate_name}
                subtitle={`${ROUND_LABEL[interview.round]} round · ${interview.requisition_title}`}
                onOpenChange={(open) => !open && onClose()}
              />
            }
            content={
              <LayoutContent padding={0} isScrollable={false}>
                <div className="flex h-full min-h-0 flex-col">
                  {interview.status === 'cancelled' && (
                    <div className="flex-none px-6 pt-4">
                      <Banner
                        status="warning"
                        title="This interview was cancelled."
                        description={interview.outcome_reason || undefined}
                      />
                    </div>
                  )}
                  {interview.status === 'no_show' && (
                    <div className="flex-none px-6 pt-4">
                      <Banner
                        status="warning"
                        title="The candidate didn't show up."
                        description={interview.outcome_reason || undefined}
                      />
                    </div>
                  )}

                  <div className="flex min-h-0 flex-1 overflow-hidden">
                    <section className="flex min-w-0 flex-1 flex-col">
                      <div className="min-h-0 flex-1 overflow-auto p-6">
                        <h3 className="mb-4 text-lg font-semibold text-primary">Outcome</h3>
                        {showsForm ? (
                          <VStack gap={4}>
                            <Field
                              label="Result"
                              inputID={resultFieldId}
                              labelID={resultFieldId}
                              isGroupLabel
                            >
                              <SegmentedControl
                                label="Result"
                                value={result}
                                onChange={(v) => setResult(v as InterviewResult)}
                                className="self-start"
                              >
                                <SegmentedControlItem value="pass" label="Pass" />
                                <SegmentedControlItem value="hold" label="Hold" />
                                <SegmentedControlItem value="fail" label="Fail" />
                              </SegmentedControl>
                            </Field>
                            <Field
                              label="Rating"
                              inputID={ratingFieldId}
                              labelID={ratingFieldId}
                              isGroupLabel
                            >
                              <StarRating level={rating} onChange={setRating} />
                            </Field>
                            <Field
                              label="Recommendation"
                              inputID={recommendationFieldId}
                              labelID={recommendationFieldId}
                              isGroupLabel
                            >
                              <SegmentedControl
                                label="Recommendation"
                                value={recommendation}
                                onChange={(v) => setRecommendation(v as InterviewRecommendation)}
                                className="self-start"
                              >
                                <SegmentedControlItem value="hire" label="Hire" />
                                <SegmentedControlItem value="next_round" label="Next round" />
                                <SegmentedControlItem value="no_hire" label="Don't hire" />
                              </SegmentedControl>
                            </Field>
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
                          <>
                            <DetailRow
                              label="Result"
                              value={
                                <Badge
                                  variant={
                                    interview.result
                                      ? RESULT_BADGE_VARIANT[interview.result]
                                      : 'neutral'
                                  }
                                  label={
                                    interview.result
                                      ? RESULT_LABEL[interview.result]
                                      : 'Not recorded'
                                  }
                                />
                              }
                            />
                            <DetailRow
                              icon={<Star className="size-3.5" aria-hidden />}
                              label="Rating"
                              value={<StarRating level={interview.rating ?? null} />}
                            />
                            <DetailRow
                              label="Recommendation"
                              value={
                                interview.recommendation
                                  ? RECOMMENDATION_LABEL[interview.recommendation]
                                  : 'Not given'
                              }
                            />
                            <VStack gap={1} className="pt-3">
                              <Text size="sm" weight="medium">
                                Feedback
                              </Text>
                              <Text
                                size="sm"
                                color={interview.feedback_note ? 'primary' : 'secondary'}
                              >
                                {interview.feedback_note || 'No feedback notes yet.'}
                              </Text>
                            </VStack>
                          </>
                        ) : (
                          <Text color="secondary" size="sm">
                            No outcome — this interview was{' '}
                            {STATUS_LABEL[interview.status].toLowerCase()}.
                          </Text>
                        )}
                      </div>
                    </section>

                    <aside className="w-[300px] shrink-0 overflow-y-auto border-l border-border px-5 py-4">
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
                      <VStack gap={1} className="pt-3">
                        <Text size="sm" weight="medium">
                          Panel
                        </Text>
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
                      </VStack>
                      <VStack gap={1} className="pt-3">
                        <Text size="sm" weight="medium">
                          Note
                        </Text>
                        <Text color={interview.note ? 'primary' : 'secondary'} size="sm">
                          {interview.note || 'No notes yet.'}
                        </Text>
                      </VStack>
                    </aside>
                  </div>
                </div>
              </LayoutContent>
            }
            footer={
              <DialogFooter
                startContent={
                  isRecording ? (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        label="Mark as no-show"
                        icon={<UserX className="size-4" />}
                        onClick={() => setReasonDialog('no_show')}
                      />
                      <Button
                        variant="secondary"
                        label="Cancel interview"
                        icon={<XCircle className="size-4" />}
                        style={{ color: 'var(--color-text-red)' }}
                        onClick={() => setReasonDialog('cancelled')}
                      />
                    </div>
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
