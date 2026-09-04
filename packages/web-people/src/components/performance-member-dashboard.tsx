import {
  Badge,
  Button,
  Card,
  Divider,
  HStack,
  proportional,
  Spinner,
  Table,
  type TableColumn,
  Text,
  VStack,
} from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import type {
  EvaluationView,
  PerformanceRollup,
  ReceivedReview,
  RollupRow,
} from '../api/people-client.ts';
import { evaluationOptions, performanceRollupOptions } from '../api/performance-query.ts';
import { formatScore, type GroupAxis, scoreBand } from '../lib/performance-scores.ts';
import { formatPerformanceMonth } from '../nav/performance-dashboard.ts';
import { EvaluateDialog } from './evaluate-dialog.tsx';
import { CycleEmptyNote, RollupBoundary } from './performance-rollup-boundary.tsx';
import { bandLabel, bandTextColor, KpiTile, pillarColor } from './performance-score-bits.tsx';
import { groupScoreColumns, totalColumn } from './performance-score-table.tsx';

type ProjectRow = RollupRow & Record<string, unknown>;

// ---- Section shell ------------------------------------------------------

function Section({
  title,
  meta,
  action,
  children,
}: {
  title: string;
  meta?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card padding={4}>
      <VStack gap={3}>
        <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Text as="h2" size="lg" weight="semibold">
              {title}
            </Text>
            {meta ? (
              <Text size="sm" color="secondary">
                {meta}
              </Text>
            ) : null}
          </HStack>
          {action}
        </HStack>
        {children}
      </VStack>
    </Card>
  );
}

// ---- My score by project ------------------------------------------------

function ByProjectTable({ rollup }: { rollup: PerformanceRollup }) {
  const columns = useMemo<TableColumn<ProjectRow>[]>(
    () => [
      {
        key: 'name',
        header: 'Project',
        width: proportional(2),
        renderCell: (p) => (
          <VStack gap={0}>
            <Text weight="semibold" size="sm" className="leading-tight">
              {p.name}
            </Text>
            <Text size="2xs" color="secondary">
              {p.subtitle ? `Lead: ${p.subtitle}` : 'No lead assigned'}
            </Text>
          </VStack>
        ),
      },
      ...groupScoreColumns<ProjectRow>(rollup.groups, (p) => p.scores, 120),
      totalColumn<ProjectRow>((p) => p.overall),
    ],
    [rollup.groups],
  );

  return (
    <Table<ProjectRow>
      data={rollup.rows as ProjectRow[]}
      columns={columns}
      idKey="id"
      density="balanced"
      hasHover
      data-testid="my-score-by-project"
    />
  );
}

// ---- My review ----------------------------------------------------------

function ReviewPillarTile({
  index,
  name,
  score,
}: {
  index: number;
  name: string;
  score: number | null;
}) {
  return (
    <Card padding={3} variant="muted">
      <VStack gap={1}>
        <Text size="2xs" color="secondary" className="truncate">
          {name}
        </Text>
        <Text
          size="xl"
          weight="semibold"
          className="tabular-nums leading-none"
          style={{ color: pillarColor(index) }}
        >
          {formatScore(score)}
        </Text>
      </VStack>
    </Card>
  );
}

function MyReview({ groups, review }: { groups: readonly GroupAxis[]; review: ReceivedReview }) {
  const band = review.overall == null ? null : scoreBand(review.overall);
  return (
    <VStack gap={4}>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Badge variant="info" label="Submitted" />
        <Text size="3xl" weight="semibold" className="tabular-nums leading-none">
          {formatScore(review.overall)}
        </Text>
        {band ? (
          <span
            className="rounded-md px-2 py-0.5 font-medium text-sm"
            style={{ color: bandTextColor(band) }}
          >
            {bandLabel(band)}
          </span>
        ) : null}
      </HStack>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {groups.map((g, i) => (
          <ReviewPillarTile
            key={g.group_id}
            index={i}
            name={g.name}
            score={review.scores[g.group_id] ?? null}
          />
        ))}
      </div>

      <VStack gap={1.5}>
        {review.strengths ? (
          <Text size="sm">
            <Text
              as="span"
              size="sm"
              weight="semibold"
              style={{ color: 'var(--color-text-green)' }}
            >
              Strengths:
            </Text>{' '}
            {review.strengths}
          </Text>
        ) : null}
        {review.improve ? (
          <Text size="sm">
            <Text as="span" size="sm" weight="semibold" style={{ color: 'var(--color-text-red)' }}>
              Improve:
            </Text>{' '}
            {review.improve}
          </Text>
        ) : null}
        {review.top_action ? (
          <Text size="sm">
            <Text as="span" size="sm" weight="semibold">
              Top action:
            </Text>{' '}
            {review.top_action}
          </Text>
        ) : null}
      </VStack>
    </VStack>
  );
}

// ---- My self-assessment -------------------------------------------------

/** Group means of the member's own scores, from the form itself (never the roll-up). */
function selfGroupScores(view: EvaluationView): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of view.groups) {
    let weight = 0;
    let acc = 0;
    for (const c of g.criteria) {
      if (c.score === null) continue;
      weight += c.weight;
      acc += c.weight * c.score;
    }
    if (weight > 0) out[g.group_id] = acc / weight;
  }
  return out;
}

/**
 * How the member's own reading sits against the review they were given. Stated as a gap
 * because that is the thing worth carrying into the conversation — two numbers side by
 * side leave the reader doing the subtraction.
 */
function GapToReview({ mine, theirs }: { mine: number; theirs: number }) {
  const gap = Math.round(Math.abs(mine - theirs) * 10) / 10;
  if (gap === 0) {
    return (
      <Text size="sm" color="secondary">
        Your view matches your lead's review.
      </Text>
    );
  }
  return (
    <Text size="sm" color="secondary">
      Your view sits{' '}
      <Text
        as="span"
        size="sm"
        weight="semibold"
        style={{ color: mine > theirs ? 'var(--color-text-green)' : 'var(--color-text-red)' }}
      >
        {gap.toFixed(1)} {mine > theirs ? 'above' : 'below'}
      </Text>{' '}
      your lead's review.
    </Text>
  );
}

/**
 * The member's own scoring of themselves (FUT-779). Deliberately built from the same
 * pillar tiles as "My review" directly below it: the two readings of one person are
 * meant to be compared, and repeating the form is what makes them comparable at a
 * glance. It never joins an average — the meta line says so rather than leaving the
 * member to wonder why their number does not move the project score.
 */
function MySelfAssessment({
  month,
  projectId,
  personId,
  groups,
  reviewOverall,
  cycleLabel,
  onOpen,
}: {
  month: string;
  projectId: string;
  personId: string;
  groups: readonly GroupAxis[];
  reviewOverall: number | null;
  cycleLabel: string;
  onOpen: () => void;
}) {
  const query = useQuery(
    evaluationOptions({ month, subject_person_id: personId, project_id: projectId }),
  );
  const view = query.data;
  const scores = view ? selfGroupScores(view) : {};
  const filed = Object.keys(scores).length > 0;
  const submitted = view?.status === 'submitted';

  const button = !view?.editable ? null : (
    <Button
      size="sm"
      variant={filed ? 'ghost' : 'primary'}
      label={filed ? 'Edit self-assessment' : 'Start self-assessment'}
      onClick={onOpen}
    />
  );

  /**
   * Nothing to show yet is its own state, not a closed cycle. The roll-up resolves first
   * and paints this section, so without the split every load would claim the window had
   * passed for a moment — and a failed request would say it for good.
   */
  const body = () => {
    if (query.isPending) return <Spinner />;
    if (query.isError || !view) {
      return (
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Text size="sm" color="secondary">
            Couldn't load your self-assessment.
          </Text>
          <Button size="sm" variant="ghost" label="Retry" onClick={() => void query.refetch()} />
        </HStack>
      );
    }
    if (!filed) {
      return (
        <Text size="sm" color="secondary">
          {view.editable
            ? 'Score yourself against the same criteria your lead uses, so you know your own view before the review conversation. Your scores are kept out of the official average.'
            : 'This cycle is closed, so the self-assessment window has passed.'}
        </Text>
      );
    }
    return (
      <VStack gap={3}>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Badge
            variant={submitted ? 'info' : 'neutral'}
            label={submitted ? 'Submitted' : 'Draft'}
          />
          <Text size="3xl" weight="semibold" className="tabular-nums leading-none">
            {formatScore(view.overall)}
          </Text>
        </HStack>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {groups.map((g, i) => (
            <ReviewPillarTile
              key={g.group_id}
              index={i}
              name={g.name}
              score={scores[g.group_id] ?? null}
            />
          ))}
        </div>
        {view.overall != null && reviewOverall != null ? (
          <GapToReview mine={view.overall} theirs={reviewOverall} />
        ) : null}
        <Text size="xsm" color="secondary">
          Your own scores, kept out of the official average.
        </Text>
      </VStack>
    );
  };

  return (
    <Section
      // The meta stays to the cycle alone: anything longer wraps the header and drops the
      // control onto a line of its own, where a quiet button reads as stray text.
      title="My self-assessment"
      meta={cycleLabel}
      action={button}
    >
      {body()}
    </Section>
  );
}

// ---- Dashboard ----------------------------------------------------------

/**
 * The member's own view for ONE project — the capacity they picked in the switcher,
 * which lists a member's projects separately. The review their lead wrote is read-only;
 * the one thing a member writes here is their own assessment.
 */
export function PerformanceMemberDashboard({
  month,
  projectId,
  personId,
}: {
  month: string;
  projectId: string;
  /** The signed-in person — the subject of their own assessment. */
  personId: string;
}) {
  const query = useQuery(performanceRollupOptions({ month, scope: 'self', project_id: projectId }));
  const cycleLabel = formatPerformanceMonth(month);
  const [selfOpen, setSelfOpen] = useState(false);

  return (
    <RollupBoundary query={query}>
      {(rollup) => {
        const band = rollup.overall == null ? null : scoreBand(rollup.overall);
        const project = rollup.rows[0] ?? null;
        const lead = project?.subtitle || 'no lead assigned';

        return (
          <VStack gap={4} data-testid="performance-home">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiTile
                label="My score"
                value={formatScore(rollup.overall)}
                hint={band ? bandLabel(band) : 'awaiting review'}
                valueColor={band ? bandTextColor(band) : undefined}
              />
              <KpiTile
                label="Review"
                value={rollup.scored > 0 ? 'Submitted' : 'Pending'}
                hint={rollup.scored > 0 ? 'by your lead' : 'still with your lead'}
                valueColor="var(--color-text-accent)"
              />
              <KpiTile
                label="Project"
                value={project?.name ?? '—'}
                hint={`Lead: ${lead}`}
                valueColor="var(--color-text-accent)"
              />
              <KpiTile
                label="Cycle"
                value={cycleLabel}
                hint="monthly review"
                valueColor="var(--color-text-accent)"
              />
            </div>

            <Section
              title="My pillar scores"
              meta={`${cycleLabel} · ${project?.name ?? 'this project'} · scored by your project lead`}
            >
              {rollup.rows.length === 0 ? (
                <Text color="secondary">
                  You aren't allocated to this project this cycle, so there is nothing to score.
                </Text>
              ) : (
                <>
                  <ByProjectTable rollup={rollup} />
                  <CycleEmptyNote scored={rollup.scored} total={rollup.total} />
                </>
              )}
            </Section>

            {rollup.rows.length > 0 ? (
              <MySelfAssessment
                month={month}
                projectId={projectId}
                personId={personId}
                groups={rollup.groups}
                reviewOverall={rollup.reviews[0]?.overall ?? null}
                cycleLabel={cycleLabel}
                onOpen={() => setSelfOpen(true)}
              />
            ) : null}

            {rollup.reviews.map((review) => (
              <Section
                key={review.project_id}
                title={`My review — ${review.project_name}`}
                meta={`${review.evaluator_name} (${review.evaluator_capacity.toUpperCase()}) · ${cycleLabel}`}
              >
                <Divider />
                <MyReview groups={rollup.groups} review={review} />
              </Section>
            ))}

            {rollup.rows.length > 0 && rollup.reviews.length === 0 ? (
              <Section title="My review" meta={cycleLabel}>
                <Text size="sm" color="secondary">
                  No lead has submitted your review yet. It appears here as soon as one does.
                </Text>
                <HStack>
                  <Button variant="ghost" label="Acknowledge review" isDisabled />
                </HStack>
              </Section>
            ) : null}

            {selfOpen ? (
              <EvaluateDialog
                month={month}
                subjectPersonId={personId}
                projectId={projectId}
                subjectName={rollup.label}
                isSelfAssessment
                onClose={() => setSelfOpen(false)}
              />
            ) : null}
          </VStack>
        );
      }}
    </RollupBoundary>
  );
}
