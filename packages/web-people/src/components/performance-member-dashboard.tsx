import {
  Badge,
  Button,
  Card,
  Divider,
  HStack,
  proportional,
  Table,
  type TableColumn,
  Text,
  VStack,
} from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import type { PerformanceRollup, ReceivedReview, RollupRow } from '../api/people-client.ts';
import { performanceRollupOptions } from '../api/performance-query.ts';
import { formatScore, type GroupAxis, scoreBand } from '../lib/performance-scores.ts';
import { formatPerformanceMonth } from '../nav/performance-dashboard.ts';
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

// ---- Dashboard ----------------------------------------------------------

/**
 * The member's own view: their score per project and the reviews their leads
 * submitted this cycle. Nothing here is editable — a member reads their review, they
 * do not write one.
 */
export function PerformanceMemberDashboard({ month }: { month: string }) {
  const query = useQuery(performanceRollupOptions({ month, scope: 'self' }));
  const cycleLabel = formatPerformanceMonth(month);

  return (
    <RollupBoundary query={query}>
      {(rollup) => {
        const band = rollup.overall == null ? null : scoreBand(rollup.overall);
        const waiting = rollup.total - rollup.scored;

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
                label="Reviews in"
                value={`${rollup.scored}/${rollup.total}`}
                hint={waiting > 0 ? `${waiting} still with your lead` : 'all leads have submitted'}
                valueColor="var(--color-text-accent)"
              />
              <KpiTile
                label="Projects"
                value={`${rollup.rows.length}`}
                hint="scored this cycle"
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
              title="My score by project"
              meta={`${cycleLabel} · ${rollup.rows.length} projects · scored by each project lead`}
            >
              {rollup.rows.length === 0 ? (
                <Text color="secondary">
                  You aren't allocated to a project this cycle, so there is nothing to score.
                </Text>
              ) : (
                <>
                  <ByProjectTable rollup={rollup} />
                  <CycleEmptyNote scored={rollup.scored} total={rollup.total} />
                </>
              )}
            </Section>

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
          </VStack>
        );
      }}
    </RollupBoundary>
  );
}
