import {
  Badge,
  Button,
  Card,
  Divider,
  HStack,
  Input,
  SegmentedControl,
  SegmentedControlItem,
  Spinner,
  Text,
  Textarea,
  useToast,
  VStack,
} from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import type { EvaluationView, EvaluationWriteBody } from '../api/people-client.ts';
import { saveEvaluationDraft, submitEvaluation } from '../api/people-client.ts';
import { evaluationOptions } from '../api/performance-query.ts';
import { formatScore } from '../lib/performance-scores.ts';
import { formatPerformanceMonth } from '../nav/performance-dashboard.ts';
import { performanceKeys } from '../state/performance-query-keys.ts';
import type { PerformanceScopeSearch } from '../state/performance-scope.ts';
import { usePerformanceScopeContext } from '../state/performance-scope-context.tsx';

/** Draft state held while the form is open — keyed by criterion id. */
type ScoreDraft = Record<string, { score: number | null; evidence: string }>;

const SCORE_VALUES = [1, 2, 3, 4, 5] as const;
/** Below this a Top Action is mandatory — mirrors the server's rule (AC3). */
const TOP_ACTION_REQUIRED_BELOW = 4;

function draftFrom(view: EvaluationView): ScoreDraft {
  const out: ScoreDraft = {};
  for (const g of view.groups) {
    for (const c of g.criteria) out[c.criterion_id] = { score: c.score, evidence: c.evidence };
  }
  return out;
}

/**
 * The monthly evaluation form (SCR-03). A TL scores each of their project's members;
 * an AM scores the project's TL. Weights and the criteria axis are read-only — they
 * come from the account's frozen config revision — and the overall is computed by the
 * server on submit, never here.
 */
export function EvaluatePage() {
  const { resolved } = usePerformanceScopeContext();
  const search = useSearch({ strict: false }) as PerformanceScopeSearch;
  const subjectId = search.subject ?? null;
  const projectId = search.subject_project ?? null;

  if (!subjectId || !projectId) {
    return (
      <VStack gap={2} data-testid="evaluate-page">
        <Text color="secondary">
          Pick someone to evaluate from your dashboard — this page scores one person for one
          project.
        </Text>
      </VStack>
    );
  }

  return <EvaluateForm month={resolved.month} subjectPersonId={subjectId} projectId={projectId} />;
}

export function EvaluateForm({
  month,
  subjectPersonId,
  projectId,
}: {
  month: string;
  subjectPersonId: string;
  projectId: string;
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
    onSuccess: (next) => afterWrite(next, 'Evaluation submitted.'),
    onError: (err: Error) => toast({ type: 'error', body: err.message }),
  });

  if (query.isPending) {
    return (
      <VStack data-testid="evaluate-page" vAlign="center" gap={2} className="py-12">
        <Spinner />
      </VStack>
    );
  }
  if (query.isError || !view) {
    return (
      <VStack data-testid="evaluate-page" gap={1}>
        <Text color="secondary">
          {query.error instanceof Error ? query.error.message : "Couldn't load this evaluation."}
        </Text>
      </VStack>
    );
  }

  const scored = Object.values(draft).filter((s) => s.score !== null).length;
  const total = Object.keys(draft).length;
  const anyBelowBar = Object.values(draft).some(
    (s) => s.score !== null && s.score < TOP_ACTION_REQUIRED_BELOW,
  );
  const readOnly = !view.editable;
  const busy = save.isPending || submit.isPending;

  return (
    <VStack gap={4} data-testid="evaluate-page">
      <Card padding={4}>
        <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
          <VStack gap={0.5}>
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Text as="h2" size="lg" weight="semibold">
                {view.subject.full_name}
              </Text>
              <Badge
                variant={view.status === 'submitted' ? 'success' : 'neutral'}
                label={view.status === 'submitted' ? 'Submitted' : 'Draft'}
              />
              {readOnly ? <Badge variant="warning" label="Cycle closed" /> : null}
            </HStack>
            <Text size="sm" color="secondary">
              {view.subject.project_name} · {formatPerformanceMonth(view.month)} · as{' '}
              {view.evaluator_capacity.toUpperCase()}
            </Text>
          </VStack>
          <VStack gap={0} hAlign="end">
            <Text size="2xs" color="secondary" className="uppercase tracking-wide">
              Overall
            </Text>
            <Text size="2xl" weight="semibold" className="tabular-nums leading-none">
              {formatScore(view.overall)}
            </Text>
            <Text size="2xs" color="secondary">
              {scored}/{total} scored
            </Text>
          </VStack>
        </HStack>
        {readOnly ? (
          <>
            <Divider />
            <Text size="sm" color="secondary" data-testid="evaluate-readonly-note">
              This cycle is closed, so the evaluation is read-only. Need to change it? Request an
              unlock.
            </Text>
          </>
        ) : null}
      </Card>

      {view.groups.map((group) => (
        <Card key={group.group_id} padding={4}>
          <VStack gap={3}>
            <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
              <Text as="h3" size="base" weight="semibold">
                {group.name}
              </Text>
              <Text size="xsm" color="secondary">
                weight {group.weight}%
              </Text>
            </HStack>
            <Divider />
            {group.criteria.map((criterion) => {
              const current = draft[criterion.criterion_id] ?? { score: null, evidence: '' };
              const needsEvidence = current.score === 1 || current.score === 5;
              return (
                <VStack key={criterion.criterion_id} gap={2}>
                  <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
                    <VStack gap={0}>
                      <Text size="sm" weight="medium">
                        {criterion.name}
                      </Text>
                      <Text size="2xs" color="secondary">
                        weight {criterion.weight}%
                      </Text>
                    </VStack>
                    <SegmentedControl
                      label={`Score for ${criterion.name}`}
                      size="sm"
                      isDisabled={readOnly || busy}
                      value={current.score === null ? '' : String(current.score)}
                      onChange={(value) =>
                        setDraft((cur) => ({
                          ...cur,
                          [criterion.criterion_id]: {
                            evidence: cur[criterion.criterion_id]?.evidence ?? '',
                            score: value === '' ? null : Number(value),
                          },
                        }))
                      }
                    >
                      <SegmentedControlItem value="" label="—" />
                      {SCORE_VALUES.map((v) => (
                        <SegmentedControlItem key={v} value={String(v)} label={String(v)} />
                      ))}
                    </SegmentedControl>
                  </HStack>
                  <Input
                    label={needsEvidence ? 'Evidence (required at 1 and 5)' : 'Evidence (optional)'}
                    value={current.evidence}
                    isDisabled={readOnly || busy}
                    status={
                      needsEvidence && current.evidence.trim().length === 0
                        ? { type: 'error', message: 'Evidence is required at 1 and 5.' }
                        : undefined
                    }
                    placeholder="What did you see that led to this score?"
                    onChange={(value: string) =>
                      setDraft((cur) => ({
                        ...cur,
                        [criterion.criterion_id]: {
                          score: cur[criterion.criterion_id]?.score ?? null,
                          evidence: value,
                        },
                      }))
                    }
                  />
                </VStack>
              );
            })}
          </VStack>
        </Card>
      ))}

      <Card padding={4}>
        <VStack gap={3}>
          <Text as="h3" size="base" weight="semibold">
            Written review
          </Text>
          <Textarea
            label="Strengths"
            value={strengths}
            isDisabled={readOnly || busy}
            onChange={(value: string) => setStrengths(value)}
          />
          <Textarea
            label="What to improve"
            value={improve}
            isDisabled={readOnly || busy}
            onChange={(value: string) => setImprove(value)}
          />
          <Textarea
            label={anyBelowBar ? 'Top action (required — a score is below 4)' : 'Top action'}
            value={topAction}
            isDisabled={readOnly || busy}
            status={
              anyBelowBar && topAction.trim().length === 0
                ? { type: 'error', message: 'Required — a criterion scored below 4.' }
                : undefined
            }
            onChange={(value: string) => setTopAction(value)}
          />
        </VStack>
      </Card>

      {readOnly ? null : (
        <HStack gap={2} hAlign="end" wrap="wrap">
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
        </HStack>
      )}
    </VStack>
  );
}
