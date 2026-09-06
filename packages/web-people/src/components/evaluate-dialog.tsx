import {
  Badge,
  Button,
  Center,
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
/** The design system's medium control height — what the score box itself stands at. */
const CONTROL_HEIGHT = 'var(--size-element-md)';
/**
 * A score is never signed and never in exponent form, but `type="number"` counts these as
 * numeric syntax and takes them. What they leave behind is a box showing "e" or "--111"
 * while the browser reports the value as empty — so the form reads it as unscored, says
 * nothing, and offers a Submit that drops the entry (FUT-973). Refuse them at the key.
 */
const NON_SCORE_KEYS = new Set(['e', 'E', '+', '-']);

function draftFrom(view: EvaluationView): ScoreDraft {
  const out: ScoreDraft = {};
  for (const g of view.groups) {
    for (const c of g.criteria) out[c.criterion_id] = { score: c.score, evidence: c.evidence };
  }
  return out;
}

/**
 * What is wrong with a typed score, in the evaluator's words — null when nothing is.
 * The box takes typing, so it can yield 3.27 or a number off the scale; the server
 * rejects both, and the evaluator is owed the reason before they hit save (FUT-973).
 */
function scoreProblem(score: number | null): string | null {
  if (score === null) return null;
  if (!Number.isFinite(score) || score < SCORE_MIN || score > SCORE_MAX) {
    return `Enter a score ${SCORE_MIN} to ${SCORE_MAX}.`;
  }
  // Inside the range but between two rungs of it. Typing "3.5" carries no float noise, so
  // measure the distance to the nearest half point rather than test for equality. The
  // message names no example number: it sits beside the entry it is about, and a stray
  // figure there reads as the value the field holds.
  if (Math.abs(score / SCORE_STEP - Math.round(score / SCORE_STEP)) > 1e-9) {
    return 'Half points only.';
  }
  return null;
}

/**
 * A stepper only ever lands on the scale: it snaps to the nearest half point and stops at
 * the ends, which also makes it the one-click way back from a score typed outside them.
 */
function stepped(value: number): number {
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
  const step = (delta: number) => onChange(stepped(score === null ? SCORE_MIN : score + delta));
  const problem = scoreProblem(score);

  return (
    // Both sides of the row hang from the top and stand at the height of the score box, so
    // the message that opens below the box never drags the criterion out of line with it.
    <HStack hAlign="between" vAlign="start" wrap="wrap" gap={3}>
      <Center height={readOnly ? undefined : CONTROL_HEIGHT}>
        <HStack gap={2} vAlign="center">
          <Text size="sm" weight="medium">
            {criterion.name}
          </Text>
          <Text size="2xs" color="secondary" className="tabular-nums">
            {formatWeight(criterion.weight)}
          </Text>
        </HStack>
      </Center>
      {readOnly ? (
        <Text size="sm" weight="semibold" className="tabular-nums">
          {score === null ? '—' : formatScore(score, 1)}
        </Text>
      ) : (
        <HStack gap={1} vAlign="start">
          <Center height={CONTROL_HEIGHT}>
            <IconButton
              size="sm"
              variant="ghost"
              label={`Lower score for ${criterion.name}`}
              icon={<Minus size={14} aria-hidden />}
              isDisabled={isDisabled || score === SCORE_MIN}
              onClick={() => step(-SCORE_STEP)}
            />
          </Center>
          {/* No min/max here on purpose: the field swallows anything outside them, so an
              out-of-range entry was dropped on blur and left an empty box with nothing
              said (FUT-973). Take the number as typed and name the problem instead. */}
          <NumberInput
            label={`Score for ${criterion.name}`}
            isLabelHidden
            value={score}
            step={SCORE_STEP}
            hasClear
            width={132}
            isDisabled={isDisabled}
            status={problem ? { type: 'error', message: problem } : undefined}
            onChange={onChange}
            onKeyDown={(event) => {
              // Modifiers are shortcuts, not typing — only a bare keypress inserts text.
              const isTyping = !event.ctrlKey && !event.metaKey && !event.altKey;
              if (isTyping && NON_SCORE_KEYS.has(event.key)) event.preventDefault();
            }}
          />
          <Center height={CONTROL_HEIGHT}>
            <IconButton
              size="sm"
              variant="ghost"
              label={`Raise score for ${criterion.name}`}
              icon={<Plus size={14} aria-hidden />}
              isDisabled={isDisabled || score === SCORE_MAX}
              onClick={() => step(SCORE_STEP)}
            />
          </Center>
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

  // Scoring yourself is the same form, but naming the subject would have it address the
  // reader in the third person — and "as SELF" is not a seat anyone holds (FUT-779).
  const isSelf = view ? view.evaluator_capacity === 'self' : isSelfAssessment;

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
    // Never the subject's to write, and the server refuses them from this seat. A row
    // written before that rule still loads its text; this stops it being sent back.
    strengths: isSelf ? '' : strengths,
    improve: isSelf ? '' : improve,
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
  // A score off the scale is a guaranteed 400 — hold the write until the field is fixed.
  const anyOffScale = Object.values(draft).some((s) => scoreProblem(s.score) !== null);
  // So is submitting without the Top Action the low score demands (AC4, assertSubmittable).
  // The field below already says so in place, so the disabled button has its reason on
  // screen beside it — a draft, by contrast, is allowed to be this incomplete.
  const topActionMissing = anyBelowBar && topAction.trim().length === 0;
  // The manager's read on the person. A closed self-assessment written before the rule
  // may still carry the text, but it is not the subject's and is not shown back to them.
  const managerNotesShown = !isSelf && (strengths.length > 0 || improve.length > 0);

  const name = view?.subject.full_name ?? subjectName ?? '';
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

                {readOnly && !managerNotesShown && !topAction ? null : (
                  <VStack gap={2}>
                    <Text as="h3" size="base" weight="semibold" className="uppercase tracking-wide">
                      Written review
                    </Text>
                    <Divider />
                    {readOnly ? (
                      <>
                        {managerNotesShown ? (
                          <>
                            <WrittenNote label="Strengths" text={strengths} />
                            <WrittenNote label="What to improve" text={improve} />
                          </>
                        ) : null}
                        <WrittenNote label="Top action" text={topAction} />
                      </>
                    ) : (
                      <>
                        {/* The manager's read on the person, not the person's own — a
                            self-assessment is scores and a Top Action (FUT-973). */}
                        {isSelf ? null : (
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
                          </>
                        )}
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
                  isDisabled={busy || anyOffScale}
                  onClick={() => save.mutate()}
                />
                <Button
                  variant="primary"
                  label={view.status === 'submitted' ? 'Re-submit' : 'Submit'}
                  isDisabled={busy || anyOffScale || topActionMissing}
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
