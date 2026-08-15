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
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { PerformanceRollup, RollupLeaf, RollupRow } from '../api/people-client.ts';
import { performanceRollupOptions } from '../api/performance-query.ts';
import { useEvaluateTarget } from '../hooks/use-evaluate-target.ts';
import { formatScore } from '../lib/performance-scores.ts';
import { EvaluateDialog } from './evaluate-dialog.tsx';
import { type HeatColumn, PillarHeatmap } from './performance-pillar-heatmap.tsx';
import { CycleEmptyNote, RollupBoundary } from './performance-rollup-boundary.tsx';
import { BandLegend, KpiTile } from './performance-score-bits.tsx';
import { groupScoreColumns, PersonCell, totalColumn } from './performance-score-table.tsx';

type MemberRow = RollupLeaf & Record<string, unknown>;

// ---- Project drill: members + team lead to evaluate ---------------------

function ProjectDrillPanel({
  rollup,
  project,
  onEvaluate,
}: {
  rollup: PerformanceRollup;
  project: RollupRow;
  onEvaluate: (personId: string) => void;
}) {
  const columns = useMemo<TableColumn<MemberRow>[]>(
    () => [
      {
        key: 'name',
        header: 'Member',
        width: proportional(2),
        renderCell: (m) => (
          <PersonCell
            name={m.name}
            role={m.subtitle}
            badge={m.is_lead ? <Badge variant="blue" label="Team Lead" /> : undefined}
          />
        ),
      },
      ...groupScoreColumns<MemberRow>(rollup.groups, (m) => m.scores),
      totalColumn<MemberRow>((m) => m.overall),
      {
        key: 'review',
        header: 'Review',
        align: 'end',
        width: pixel(132),
        renderCell: (m) => {
          // The Team Lead is the person the AM evaluates — action lives on their row.
          if (m.is_lead) {
            const done = m.scored > 0;
            return (
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant={done ? 'ghost' : 'primary'}
                  label={done ? 'Edit review' : 'Evaluate'}
                  onClick={() => onEvaluate(m.id)}
                />
              </div>
            );
          }
          return (
            <div className="flex justify-end">
              {m.scored > 0 ? (
                <Badge variant="success" label="Reviewed" />
              ) : (
                <Badge variant="warning" label="Pending" />
              )}
            </div>
          );
        },
      },
    ],
    [rollup.groups, onEvaluate],
  );

  return (
    <VStack gap={2}>
      <Text as="h3" size="base" weight="semibold">
        {project.name} — pillar scores per member
      </Text>
      <Table<MemberRow>
        data={project.children as MemberRow[]}
        columns={columns}
        idKey="id"
        density="balanced"
        hasHover
        data-testid="members-table"
      />
    </VStack>
  );
}

// ---- Dashboard ----------------------------------------------------------

/**
 * The AM's account view: pillar scores by project, drilling into each project's
 * people. Every number comes from the roll-up API — the AM's job on this screen is
 * evaluating each project's Team Lead.
 */
export function PerformanceAmDashboard({
  accountId,
  accountLabel,
  month,
}: {
  accountId: string;
  accountLabel: string;
  month: string;
}) {
  const query = useQuery(
    performanceRollupOptions({ month, scope: 'account', account_id: accountId }),
  );
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const evaluate = useEvaluateTarget();

  return (
    <RollupBoundary query={query}>
      {(rollup) => {
        const active = selectedProject
          ? (rollup.rows.find((p) => p.id === selectedProject) ?? null)
          : null;
        const leadsToReview = rollup.rows.filter((p) =>
          p.children.some((c) => c.is_lead && c.scored === 0),
        ).length;

        const heatColumns: HeatColumn[] = rollup.rows.map((pr) => ({
          id: pr.id,
          title: pr.name,
          subtitle: `${pr.member_count} ppl · ${pr.subtitle || 'no lead'} ▸`,
          scores: pr.scores,
          overall: pr.overall,
        }));

        return (
          <VStack gap={4} data-testid="performance-home">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <KpiTile
                label="Team Leads to review"
                value={`${leadsToReview}`}
                hint={`of ${rollup.rows.length} on ${rollup.label}`}
              />
              <KpiTile
                label="Evaluations"
                value={`${rollup.scored}/${rollup.total}`}
                hint="submitted this cycle"
              />
              <KpiTile
                label="Account average"
                value={formatScore(rollup.overall, 1)}
                hint="weighted, 1–5 scale"
              />
            </div>

            <Card padding={4}>
              <VStack gap={3}>
                <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
                  <Text as="h2" size="lg" weight="semibold">
                    Pillar scores by project
                  </Text>
                  <Text size="sm" color="secondary">
                    {accountLabel} · click a project to see each member
                  </Text>
                </HStack>

                {rollup.rows.length === 0 ? (
                  <Text color="secondary">No projects are running on this account this cycle.</Text>
                ) : (
                  <PillarHeatmap
                    groups={rollup.groups}
                    columns={heatColumns}
                    selectedId={selectedProject}
                    onSelect={(id) => setSelectedProject((cur) => (cur === id ? null : id))}
                  />
                )}

                <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
                  <BandLegend />
                  {active ? null : (
                    <Text size="xsm" color="secondary">
                      Select a project column to drill in ▸
                    </Text>
                  )}
                </HStack>
                <CycleEmptyNote scored={rollup.scored} total={rollup.total} />

                {active ? (
                  <>
                    <Divider />
                    <ProjectDrillPanel
                      rollup={rollup}
                      project={active}
                      onEvaluate={(personId) => evaluate.open(personId, active.id)}
                    />
                  </>
                ) : null}
              </VStack>
            </Card>

            {evaluate.target ? (
              <EvaluateDialog
                month={month}
                subjectPersonId={evaluate.target.subjectPersonId}
                projectId={evaluate.target.projectId}
                subjectName={
                  rollup.rows
                    .flatMap((p) => p.children)
                    .find((c) => c.id === evaluate.target?.subjectPersonId)?.name
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
