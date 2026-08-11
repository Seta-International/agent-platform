import {
  Badge,
  Button,
  Card,
  Divider,
  HStack,
  pixel,
  proportional,
  Table,
  type TableColumn,
  Text,
  VStack,
} from '@seta/shared-ui';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import {
  type MemberDashboardData,
  type MemberProjectScore,
  memberDashboardFixture,
} from '../mock/performance-member-fixture.ts';
import { type PerformanceGroupAxis, scoreBand } from '../mock/performance-scores.ts';
import { formatPerformanceMonth } from '../nav/performance-dashboard.ts';
import { bandLabel, bandTextColor, KpiTile, pillarColor } from './performance-score-bits.tsx';
import { groupScoreColumns, totalColumn } from './performance-score-table.tsx';

const SELF_ASSESSMENT_COPY: Record<
  MemberDashboardData['self_assessment'],
  { value: string; hint: string }
> = {
  not_started: { value: 'Not started', hint: 'do it first' },
  in_progress: { value: 'In progress', hint: 'finish it' },
  submitted: { value: 'Submitted', hint: 'done' },
};

const REVIEW_STATE_COPY: Record<
  MemberDashboardData['review_state'],
  { value: string; hint: string }
> = {
  not_ready: { value: 'Not ready', hint: 'awaiting lead' },
  pending: { value: 'In review', hint: 'lead scoring' },
  submitted: { value: 'Submitted', hint: 'review ready' },
  locked: { value: 'Locked', hint: 'cycle closed' },
};

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

function ByProjectTable({
  groups,
  rows,
}: {
  groups: readonly PerformanceGroupAxis[];
  rows: readonly MemberProjectScore[];
}) {
  const columns = useMemo<TableColumn<MemberProjectScore & Record<string, unknown>>[]>(
    () => [
      {
        key: 'project_name',
        header: 'Project',
        width: proportional(2),
        renderCell: (p) => (
          <VStack gap={0}>
            <Text weight="semibold" size="sm" className="leading-tight">
              {p.project_name}
            </Text>
            <Text size="2xs" color="secondary">
              {p.lead_label}
            </Text>
          </VStack>
        ),
      },
      {
        key: 'alloc_pct',
        header: 'Alloc',
        align: 'center',
        width: pixel(84),
        renderCell: (p) => (
          <Text size="sm" className="tabular-nums">
            {p.alloc_pct}%
          </Text>
        ),
      },
      ...groupScoreColumns<MemberProjectScore & Record<string, unknown>>(
        groups,
        (p) => p.scores,
        120,
      ),
      totalColumn<MemberProjectScore & Record<string, unknown>>((p) => p.total),
    ],
    [groups],
  );

  return (
    <Table<MemberProjectScore & Record<string, unknown>>
      data={rows as (MemberProjectScore & Record<string, unknown>)[]}
      columns={columns}
      idKey="project_id"
      density="balanced"
      hasHover
      data-testid="my-score-by-project"
    />
  );
}

// ---- My review ----------------------------------------------------------

function ReviewPillarTile({ index, name, score }: { index: number; name: string; score: number }) {
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
          {score.toFixed(2)}
        </Text>
      </VStack>
    </Card>
  );
}

function MyReview({
  groups,
  review,
}: {
  groups: readonly PerformanceGroupAxis[];
  review: NonNullable<MemberDashboardData['review']>;
}) {
  const band = scoreBand(review.overall);
  return (
    <VStack gap={4}>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Badge variant="info" label="Submitted" />
        <Text size="3xl" weight="semibold" className="tabular-nums leading-none">
          {review.overall.toFixed(2)}
        </Text>
        <span
          className="rounded-md px-2 py-0.5 font-medium text-sm"
          style={{
            background: 'var(--color-background-green)',
            color: 'var(--color-text-green)',
          }}
        >
          {bandLabel(band)}
        </span>
      </HStack>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {groups.map((g, i) => (
          <ReviewPillarTile
            key={g.group_id}
            index={i}
            name={g.name}
            score={review.pillars[g.group_id] ?? 0}
          />
        ))}
      </div>

      <VStack gap={1.5}>
        <Text size="sm">
          <Text as="span" size="sm" weight="semibold" style={{ color: 'var(--color-text-green)' }}>
            Strengths:
          </Text>{' '}
          {review.strengths}
        </Text>
        <Text size="sm">
          <Text as="span" size="sm" weight="semibold" style={{ color: 'var(--color-text-red)' }}>
            Improve:
          </Text>{' '}
          {review.improve}
        </Text>
        <Text size="sm">
          <Text as="span" size="sm" weight="semibold">
            Focus:
          </Text>{' '}
          {review.focus}
        </Text>
      </VStack>

      <HStack>
        <Button
          variant={review.acknowledged ? 'ghost' : 'primary'}
          label={review.acknowledged ? 'Review acknowledged' : 'Acknowledge review'}
          isDisabled={review.acknowledged}
        />
      </HStack>
    </VStack>
  );
}

// ---- Dashboard ----------------------------------------------------------

export function PerformanceMemberDashboard({
  groups,
  memberLabel,
  month,
}: {
  groups: readonly PerformanceGroupAxis[];
  memberLabel: string;
  month: string;
}) {
  const cycleLabel = formatPerformanceMonth(month);
  const data = useMemo(
    () => memberDashboardFixture(groups, memberLabel, cycleLabel),
    [groups, memberLabel, cycleLabel],
  );
  const myBand = data.my_score == null ? null : scoreBand(data.my_score);
  const self = SELF_ASSESSMENT_COPY[data.self_assessment];
  const state = REVIEW_STATE_COPY[data.review_state];

  return (
    <VStack gap={4} data-testid="performance-home">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label="My score"
          value={data.my_score == null ? '—' : data.my_score.toFixed(2)}
          hint={myBand ? bandLabel(myBand) : 'awaiting review'}
          valueColor={myBand ? bandTextColor(myBand) : undefined}
        />
        <KpiTile
          label="Self-assessment"
          value={self.value}
          hint={self.hint}
          valueColor="var(--color-text-accent)"
        />
        <KpiTile
          label="Status"
          value={state.value}
          hint={state.hint}
          valueColor="var(--color-text-accent)"
        />
        <KpiTile
          label="Cycle"
          value={cycleLabel}
          hint="monthly review"
          valueColor="var(--color-text-accent)"
        />
      </div>

      {/* Self-assessment prompt */}
      <Section
        title="My self-assessment"
        meta={`${cycleLabel} · rate yourself before your lead reviews`}
        action={
          data.self_assessment === 'submitted' ? (
            <Button variant="ghost" label="View self-assessment" />
          ) : (
            <Button variant="primary" label="Start self-assessment" />
          )
        }
      >
        <Divider />
        <Text size="sm" color="secondary">
          {data.self_assessment === 'not_started'
            ? "You haven't self-assessed this month yet. It helps your lead calibrate."
            : 'Your self-assessment is in progress — finish it before the review window closes.'}
        </Text>
      </Section>

      {/* Score by project */}
      <Section
        title="My score by project"
        meta={`${cycleLabel} · ${data.by_project.length} projects · scored by each project lead`}
      >
        <ByProjectTable groups={data.groups} rows={data.by_project} />
      </Section>

      {/* Lead's review */}
      {data.review ? (
        <Section title="My review" meta={`${data.review.lead_label} · ${cycleLabel}`}>
          <MyReview groups={data.groups} review={data.review} />
        </Section>
      ) : null}
    </VStack>
  );
}
