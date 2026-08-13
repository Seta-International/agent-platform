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
import { useMemo } from 'react';
import type { PerformanceGroupAxis } from '../mock/performance-scores.ts';
import {
  type TlDashboardData,
  type TlMemberRow,
  type TlReviewState,
  tlDashboardFixture,
} from '../mock/performance-tl-fixture.ts';
import { formatPerformanceMonth } from '../nav/performance-dashboard.ts';
import { type HeatColumn, PillarHeatmap } from './performance-pillar-heatmap.tsx';
import { BandLegend, KpiTile } from './performance-score-bits.tsx';
import { groupScoreColumns, PersonCell, totalColumn } from './performance-score-table.tsx';

const MY_REVIEW_COPY: Record<TlReviewState, { value: string; hint: string }> = {
  not_ready: { value: 'Not ready', hint: 'cycle open' },
  pending: { value: 'Pending', hint: 'awaiting' },
  submitted: { value: 'Submitted', hint: 'from your AM' },
};

// ---- Evaluate-each-member table -----------------------------------------

function EvaluateMembersTable({
  groups,
  project,
}: {
  groups: readonly PerformanceGroupAxis[];
  project: TlDashboardData;
}) {
  const columns = useMemo<TableColumn<TlMemberRow & Record<string, unknown>>[]>(
    () => [
      {
        key: 'name',
        header: 'Member',
        width: proportional(2),
        renderCell: (m) => <PersonCell name={m.name} role={m.role} />,
      },
      ...groupScoreColumns<TlMemberRow & Record<string, unknown>>(groups, (m) => m.scores),
      totalColumn<TlMemberRow & Record<string, unknown>>((m) => m.total),
      {
        key: 'review',
        header: 'Review',
        align: 'end',
        width: pixel(200),
        renderCell: (m) => {
          const evaluated = m.status === 'evaluated';
          return (
            <HStack gap={2} vAlign="center" hAlign="end">
              {evaluated ? (
                <Badge variant="success" label="Evaluated" />
              ) : (
                <Badge variant="neutral" label="Auto · pending" />
              )}
              <Button size="sm" variant="secondary" label={evaluated ? 'Edit' : 'Evaluate'} />
            </HStack>
          );
        },
      },
    ],
    [groups],
  );

  return (
    <VStack gap={2}>
      <Text as="h3" size="base" weight="semibold">
        {project.project_name} — evaluate each member
      </Text>
      <Table<TlMemberRow & Record<string, unknown>>
        data={project.members as (TlMemberRow & Record<string, unknown>)[]}
        columns={columns}
        idKey="member_id"
        density="balanced"
        hasHover
        data-testid="evaluate-members-table"
      />
    </VStack>
  );
}

// ---- Dashboard ----------------------------------------------------------

export function PerformanceTlDashboard({
  groups,
  projectName,
  month,
}: {
  groups: readonly PerformanceGroupAxis[];
  projectName: string;
  month: string;
}) {
  const cycleLabel = formatPerformanceMonth(month);
  const data = useMemo(
    () => tlDashboardFixture(groups, projectName, cycleLabel),
    [groups, projectName, cycleLabel],
  );
  const review = MY_REVIEW_COPY[data.my_review_state];
  const pct = data.team_size === 0 ? 0 : Math.round((data.evaluated_count / data.team_size) * 100);

  const heatColumns: HeatColumn[] = [
    {
      id: data.project_id,
      title: data.project_name,
      subtitle: `${data.team_size} ppl ▾`,
      scores: data.project_scores,
      overall: data.project_overall,
    },
  ];

  return (
    <VStack gap={4} data-testid="performance-home">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label="My team"
          value={`${data.team_size}`}
          hint="to evaluate this month"
          valueColor="var(--color-text-accent)"
        />
        <KpiTile
          label="Evaluated"
          value={`${data.evaluated_count}/${data.team_size}`}
          hint={`${pct}% done`}
          valueColor="var(--color-text-green)"
        />
        <KpiTile
          label="Team avg"
          value={data.team_avg.toFixed(2)}
          hint="this period"
          valueColor="var(--color-text-green)"
        />
        <KpiTile label="My review (AM)" value={review.value} hint={review.hint} />
      </div>

      {/* One cohesive block: project rollup heatmap → legend → evaluate members */}
      <Card padding={4}>
        <VStack gap={3}>
          <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
            <Text as="h2" size="lg" weight="semibold">
              My project — pillar scores
            </Text>
            <Text size="sm" color="secondary">
              rolls up from your member evaluations · {cycleLabel}
            </Text>
          </HStack>

          <PillarHeatmap groups={data.groups} columns={heatColumns} selectedId={data.project_id} />

          <BandLegend />

          <Divider />

          <EvaluateMembersTable groups={data.groups} project={data} />
        </VStack>
      </Card>
    </VStack>
  );
}
