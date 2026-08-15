import {
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
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { PerformanceRollup, RollupRow } from '../api/people-client.ts';
import { performanceRollupOptions } from '../api/performance-query.ts';
import { useEvaluateTarget } from '../hooks/use-evaluate-target.ts';
import { formatScore, progressPct } from '../lib/performance-scores.ts';
import { formatPerformanceMonth } from '../nav/performance-dashboard.ts';
import { EvaluateDialog } from './evaluate-dialog.tsx';
import { type HeatColumn, PillarHeatmap } from './performance-pillar-heatmap.tsx';
import { CycleEmptyNote, RollupBoundary } from './performance-rollup-boundary.tsx';
import { BandLegend, KpiTile } from './performance-score-bits.tsx';
import { groupScoreColumns, PersonCell, totalColumn } from './performance-score-table.tsx';

type MemberRow = RollupRow & Record<string, unknown>;

// ---- Evaluate-each-member table -----------------------------------------

function EvaluateMembersTable({
  rollup,
  members,
  onEvaluate,
}: {
  rollup: PerformanceRollup;
  members: readonly RollupRow[];
  onEvaluate: (personId: string) => void;
}) {
  const columns = useMemo<TableColumn<MemberRow>[]>(
    () => [
      {
        key: 'name',
        header: 'Member',
        width: proportional(2),
        renderCell: (m) => <PersonCell name={m.name} role={m.subtitle} />,
      },
      ...groupScoreColumns<MemberRow>(rollup.groups, (m) => m.scores),
      totalColumn<MemberRow>((m) => m.overall),
      {
        key: 'review',
        header: 'Review',
        align: 'end',
        width: pixel(120),
        // One control per row, nothing else: the scores already say who has been
        // evaluated (a whole row of em dashes is the "not yet"), so a status badge beside
        // them only made the column ragged. The button carries the state instead —
        // filled for work still owed, quiet for a review already written.
        renderCell: (m) => {
          const evaluated = m.scored > 0;
          return (
            <Button
              size="sm"
              variant={evaluated ? 'ghost' : 'primary'}
              label={evaluated ? 'Edit' : 'Evaluate'}
              onClick={() => onEvaluate(m.id)}
            />
          );
        },
      },
    ],
    [rollup.groups, onEvaluate],
  );

  return (
    <VStack gap={2}>
      <Text as="h3" size="base" weight="semibold">
        {rollup.label} — evaluate each member
      </Text>
      <Table<MemberRow>
        data={members as MemberRow[]}
        columns={columns}
        idKey="id"
        density="balanced"
        hasHover
        data-testid="evaluate-members-table"
      />
    </VStack>
  );
}

// ---- Dashboard ----------------------------------------------------------

/**
 * The Team Lead's project view. The roll-up returns every person allocated to the
 * project including the lead themselves; the lead's own row is their AM's review of
 * them, so it is split out of the "people I evaluate" table.
 */
export function PerformanceTlDashboard({ projectId, month }: { projectId: string; month: string }) {
  const query = useQuery(
    performanceRollupOptions({ month, scope: 'project', project_id: projectId }),
  );
  const cycleLabel = formatPerformanceMonth(month);
  const evaluate = useEvaluateTarget();

  return (
    <RollupBoundary query={query}>
      {(rollup) => {
        const mine = rollup.rows.find((r) => r.is_lead) ?? null;
        const members = rollup.rows.filter((r) => !r.is_lead);
        const evaluated = members.filter((m) => m.scored > 0).length;

        const heatColumns: HeatColumn[] = [
          {
            id: projectId,
            title: rollup.label,
            subtitle: `${rollup.rows.length} ppl`,
            scores: rollup.scores,
            overall: rollup.overall,
          },
        ];

        return (
          <VStack gap={4} data-testid="performance-home">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiTile
                label="My team"
                value={`${members.length}`}
                hint="to evaluate this month"
                valueColor="var(--color-text-accent)"
              />
              <KpiTile
                label="Evaluated"
                value={`${evaluated}/${members.length}`}
                hint={`${progressPct(evaluated, members.length)}% done`}
                valueColor="var(--color-text-green)"
              />
              <KpiTile label="Team avg" value={formatScore(rollup.overall)} hint="this period" />
              <KpiTile
                label="My review (AM)"
                value={mine && mine.scored > 0 ? formatScore(mine.overall) : 'Pending'}
                hint={mine && mine.scored > 0 ? 'from your AM' : 'awaiting your AM'}
              />
            </div>

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

                <PillarHeatmap
                  groups={rollup.groups}
                  columns={heatColumns}
                  selectedId={projectId}
                />

                <BandLegend />
                <CycleEmptyNote scored={rollup.scored} total={rollup.total} />

                <Divider />

                {members.length === 0 ? (
                  <Text color="secondary">
                    Nobody else is allocated to this project this cycle.
                  </Text>
                ) : (
                  <EvaluateMembersTable
                    rollup={rollup}
                    members={members}
                    onEvaluate={(personId) => evaluate.open(personId, projectId)}
                  />
                )}
              </VStack>
            </Card>

            {evaluate.target ? (
              <EvaluateDialog
                month={month}
                subjectPersonId={evaluate.target.subjectPersonId}
                projectId={evaluate.target.projectId}
                subjectName={
                  rollup.rows.find((r) => r.id === evaluate.target?.subjectPersonId)?.name
                }
                onClose={evaluate.close}
              />
            ) : null}
          </VStack>
        );
      }}
    </RollupBoundary>
  );
}
