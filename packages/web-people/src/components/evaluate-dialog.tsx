import {
  Badge,
  Button,
  Dialog,
  DialogFooter,
  DialogHeader,
  Divider,
  HStack,
  IconButton,
  Layout,
  LayoutContent,
  NumberInput,
  Spinner,
  Text,
  Textarea,
  useToast,
  VStack,
} from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import type {
  EvaluationCriterionView,
  EvaluationView,
  EvaluationWriteBody,
} from '../api/people-client.ts';
import { saveEvaluationDraft, submitEvaluation } from '../api/people-client.ts';
import { evaluationOptions } from '../api/performance-query.ts';
import { formatScore, formatWeight } from '../lib/performance-scores.ts';
import { formatPerformanceMonth } from '../nav/performance-dashboard.ts';
import { performanceKeys } from '../state/performance-query-keys.ts';
import { pillarColor } from './performance-score-bits.tsx';

/** Draft state held while the dialog is open — keyed by criterion id. */
type ScoreDraft = Record<string, { score: number | null; evidence: string }>;

/** The 1–5 scale the server validates against, in half points. */
const SCORE_MIN = 1;
const SCORE_MAX = 5;
const SCORE_STEP = 0.5;
/** Below this a Top Action is mandatory — mirrors the server's rule (AC4). */
const TOP_ACTION_REQUIRED_BELOW = 4;

function draftFrom(view: EvaluationView): ScoreDraft {
  const out: ScoreDraft = {};
  for (const g of view.groups) {
    for (const c of g.criteria) out[c.criterion_id] = { score: c.score, evidence: c.evidence };
  }
  return out;
}

/**
 * The box takes typing, so it can yield 3.27 or a number off the scale. Scores run 1 to 5
 * in half points — the server rejects anything else — so snap here rather than let a
 * submit fail on it.
 */
function normalizeScore(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const snapped = Math.round(value / SCORE_STEP) * SCORE_STEP;
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, snapped));
}

// ---- One criterion ------------------------------------------------------

function CriterionRow({
  criterion,
  score,
  readOnly,
  isDisabled,
  onChange,
}: {
  criterion: EvaluationCriterionView;
  score: number | null;
  /** Closed cycle: the evaluation is a record to read, not a form to fill. */
  readOnly: boolean;
  isDisabled: boolean;
  onChange: (score: number | null) => void;
}) {
  /** Stepping an unscored criterion starts it at the bottom of the scale. */
  const step = (delta: number) =>
    onChange(normalizeScore(score === null ? SCORE_MIN : score + delta));

  return (
    <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
      <HStack gap={2} vAlign="center">
        <Text size="sm" weight="medium">
          {criterion.name}
        </Text>
        <Text size="2xs" color="secondary" className="tabular-nums">
          {formatWeight(criterion.weight)}
        </Text>
      </HStack>
      {readOnly ? (
        <Text size="sm" weight="semibold" className="tabular-nums">
          {score === null ? '—' : formatScore(score, 1)}
        </Text>
      ) : (
        <HStack gap={1} vAlign="center">
          <IconButton
            size="sm"
            variant="ghost"
            label={`Lower score for ${criterion.name}`}
            icon={<Minus size={14} aria-hidden />}
            isDisabled={isDisabled || score === SCORE_MIN}
            onClick={() => step(-SCORE_STEP)}
          />
          <NumberInput
            label={`Score for ${criterion.name}`}
            isLabelHidden
            value={score}
            min={SCORE_MIN}
            max={SCORE_MAX}
            step={SCORE_STEP}
            hasClear
            width={88}
            isDisabled={isDisabled}
            onChange={(next) => onChange(normalizeScore(next))}
          />
          <IconButton
            size="sm"
            variant="ghost"
            label={`Raise score for ${criterion.name}`}
            icon={<Plus size={14} aria-hidden />}
            isDisabled={isDisabled || score === SCORE_MAX}
            onClick={() => step(SCORE_STEP)}
          />
        </HStack>
      )}
    </HStack>
  );
}

/** One written answer on a closed evaluation — a record to read, not a field to fill. */
function WrittenNote({ label, text }: { label: string; text: string }) {
  if (!text) return null;
  return (
    <VStack gap={0.5}>
      <Text size="2xs" color="secondary" className="uppercase tracking-wide">
        {label}
      </Text>
      <Text size="sm">{text}</Text>
    </VStack>
  );
}

// ---- Dialog -------------------------------------------------------------

/**
 * The monthly evaluation (SCR-03), opened in place over the dashboard that launched
 * it — a Team Lead scoring their members works down a list, and losing the list to a
 * separate page each time costs them their place.
 *
 * Weights and the criteria axis are read-only: they come from the account's frozen
 * config revision. The overall is computed by the server on submit, never here.
 */
export function EvaluateDialog({
  month,
  subjectPersonId,
  projectId,
  subjectName,
  isSelfAssessment = false,
  onClose,
}: {
  month: string;
  subjectPersonId: string;
  projectId: string;
  /** Known from the row that opened this — keeps the title steady while the form loads. */
  subjectName?: string;
  /**
   * The caller already knows whether this is the member's own form; without it the header
   * spends the first frames addressing them by name, in a title written for their manager.
   */
  isSelfAssessment?: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery(
    evaluationOptions({ month, subject_person_id: subjectPersonId, project_id: projectId }),
  );
  const view = query.data;

  const [draft, setDraft] = useState<ScoreDraft>({});
  const [strengths, setStrengths] = useState('');
  const [improve, setImprove] = useState('');
  const [topAction, setTopAction] = useState('');
  // Re-seed whenever the server hands back a new version (first load, save, submit).
  const [seededVersion, setSeededVersion] = useState<number | null>(null);

  useEffect(() => {
    if (!view || seededVersion === view.version) return;
    setDraft(draftFrom(view));
    setStrengths(view.strengths);
    setImprove(view.improve);
    setTopAction(view.top_action);
    setSeededVersion(view.version);
  }, [view, seededVersion]);

  const body = (): EvaluationWriteBody => ({
    month,
    subject_person_id: subjectPersonId,
    project_id: projectId,
    base_version: view?.version ?? 0,
    scores: Object.entries(draft).map(([criterion_id, s]) => ({
      criterion_id,
      score: s.score,
      evidence: s.evidence,
    })),
    strengths,
    improve,
    top_action: topAction,
  });

  const afterWrite = (next: EvaluationView, message: string) => {
    queryClient.setQueryData(performanceKeys.evaluation(month, subjectPersonId, projectId), next);
    // The dashboards count submitted evaluations — their roll-ups are now stale.
    void queryClient.invalidateQueries({ queryKey: performanceKeys.all });
    toast({ body: message });
  };

  const save = useMutation({
    mutationFn: () => saveEvaluationDraft(body()),
    onSuccess: (next) => afterWrite(next, 'Draft saved.'),
    onError: (err: Error) => toast({ type: 'error', body: err.message }),
  });

  const submit = useMutation({
    mutationFn: () => submitEvaluation(body()),
    onSuccess: (next) => {
      afterWrite(next, 'Evaluation submitted.');
      // Submitting ends the task — hand the evaluator back to their list.
      onClose();
    },
    onError: (err: Error) => toast({ type: 'error', body: err.message }),
  });

  const busy = save.isPending || submit.isPending;
  const readOnly = !view?.editable;
  const scored = Object.values(draft).filter((s) => s.score !== null).length;
  const total = Object.keys(draft).length;
  const anyBelowBar = Object.values(draft).some(
    (s) => s.score !== null && s.score < TOP_ACTION_REQUIRED_BELOW,
  );

  const name = view?.subject.full_name ?? subjectName ?? '';
  // Scoring yourself is the same form, but naming the subject would have it address the
  // reader in the third person — and "as SELF" is not a seat anyone holds (FUT-779).
  const isSelf = view ? view.evaluator_capacity === 'self' : isSelfAssessment;
  const title = !isSelf
    ? name
      ? `Evaluate · ${name}`
      : 'Evaluate'
    : view
      ? `My self-assessment · ${view.subject.project_name}`
      : 'My self-assessment';
  const subtitle = !view
    ? formatPerformanceMonth(month)
    : isSelf
      ? `${formatPerformanceMonth(view.month)} · your own scores, kept out of the official average`
      : `${view.subject.project_name} · ${formatPerformanceMonth(view.month)} · as ${view.evaluator_capacity.toUpperCase()}`;

  return (
    <Dialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      // A form: Escape still gets out, but a stray backdrop click can't drop the scores.
      purpose="form"
      width={760}
      maxHeight="86vh"
      data-testid="evaluate-dialog"
    >
      <Layout
        header={
          <DialogHeader
            title={title}
            subtitle={subtitle}
            onOpenChange={(open) => {
              if (!open) onClose();
            }}
            endContent={
              view ? (
                <HStack gap={2} vAlign="center">
                  <Badge
                    variant={view.status === 'submitted' ? 'success' : 'neutral'}
                    label={view.status === 'submitted' ? 'Submitted' : 'Draft'}
                  />
                  {/* Only once there is one: an em dash sitting beside the close button
                      reads as a minimise control, not as "no score yet". */}
                  {view.overall === null ? null : (
                    <HStack gap={1} vAlign="center">
                      <Text size="2xs" color="secondary" className="uppercase tracking-wide">
                        Overall
                      </Text>
                      <Text size="lg" weight="semibold" className="tabular-nums">
                        {formatScore(view.overall)}
                      </Text>
                    </HStack>
                  )}
                </HStack>
              ) : undefined
            }
          />
        }
        content={
          <LayoutContent>
            {query.isPending ? (
              <VStack vAlign="center" gap={2} className="py-12">
                <Spinner />
              </VStack>
            ) : query.isError || !view ? (
              <Text color="secondary">
                {query.error instanceof Error
                  ? query.error.message
                  : "Couldn't load this evaluation."}
              </Text>
            ) : (
              <VStack gap={4}>
                {readOnly ? (
                  <Text size="sm" color="secondary" data-testid="evaluate-readonly-note">
                    This cycle is closed, so the evaluation is read-only. Need to change it? Request
                    an unlock.
                  </Text>
                ) : null}

                {view.groups.map((group, index) => (
                  <VStack key={group.group_id} gap={2}>
                    {/* A pillar heads a block of criteria, so it outranks them on the page:
                        larger than the rows beneath it, and in the pillar's own colour. */}
                    <HStack gap={2} vAlign="center">
                      <Text
                        as="h3"
                        size="base"
                        weight="semibold"
                        className="uppercase tracking-wide"
                        style={{ color: pillarColor(index) }}
                      >
                        {group.name}
                      </Text>
                      <Text size="xsm" color="secondary" className="tabular-nums">
                        {formatWeight(group.weight)}
                      </Text>
                    </HStack>
                    {group.criteria.map((criterion) => (
                      <VStack key={criterion.criterion_id} gap={2}>
                        <Divider />
                        <CriterionRow
                          criterion={criterion}
                          readOnly={readOnly}
                          score={draft[criterion.criterion_id]?.score ?? null}
                          isDisabled={busy}
                          onChange={(score) =>
                            setDraft((cur) => ({
                              ...cur,
                              [criterion.criterion_id]: {
                                // Any note written before the form dropped the field rides
                                // along untouched rather than being wiped by a re-submit.
                                evidence: cur[criterion.criterion_id]?.evidence ?? '',
                                score,
                              },
                            }))
                          }
                        />
                      </VStack>
                    ))}
                  </VStack>
                ))}

                {readOnly && !strengths && !improve && !topAction ? null : (
                  <VStack gap={2}>
                    <Text as="h3" size="base" weight="semibold" className="uppercase tracking-wide">
                      Written review
                    </Text>
                    <Divider />
                    {readOnly ? (
                      <>
                        <WrittenNote label="Strengths" text={strengths} />
                        <WrittenNote label="What to improve" text={improve} />
                        <WrittenNote label="Top action" text={topAction} />
                      </>
                    ) : (
                      <>
                        <Textarea
                          label="Strengths"
                          value={strengths}
                          isDisabled={busy}
                          onChange={(value: string) => setStrengths(value)}
                        />
                        <Textarea
                          label="What to improve"
                          value={improve}
                          isDisabled={busy}
                          onChange={(value: string) => setImprove(value)}
                        />
                        <Textarea
                          label={
                            anyBelowBar
                              ? 'Top action (required — a score is below 4)'
                              : 'Top action'
                          }
                          value={topAction}
                          isDisabled={busy}
                          status={
                            anyBelowBar && topAction.trim().length === 0
                              ? { type: 'error', message: 'Required — a criterion scored below 4.' }
                              : undefined
                          }
                          onChange={(value: string) => setTopAction(value)}
                        />
                      </>
                    )}
                  </VStack>
                )}
              </VStack>
            )}
          </LayoutContent>
        }
        footer={
          <DialogFooter
            startContent={
              view && !readOnly ? (
                <Text size="xsm" color="secondary" className="tabular-nums">
                  {scored}/{total} scored
                </Text>
              ) : undefined
            }
          >
            <Button variant="secondary" label={readOnly ? 'Close' : 'Cancel'} onClick={onClose} />
            {view && !readOnly ? (
              <>
                <Button
                  variant="secondary"
                  label="Save draft"
                  isDisabled={busy}
                  onClick={() => save.mutate()}
                />
                <Button
                  variant="primary"
                  label={view.status === 'submitted' ? 'Re-submit' : 'Submit'}
                  isDisabled={busy}
                  onClick={() => submit.mutate()}
                />
              </>
            ) : null}
          </DialogFooter>
        }
      />
    </Dialog>
  );
}
