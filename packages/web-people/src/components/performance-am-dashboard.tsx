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
import { useMemo, useState } from 'react';
import {
  type AmDashboardData,
  amDashboardFixture,
  type MemberRow,
  type ProjectDrill,
  type ReviewStatus,
} from '../mock/performance-am-fixture.ts';
import type { PerformanceGroupAxis } from '../mock/performance-scores.ts';
import { formatPerformanceMonth } from '../nav/performance-dashboard.ts';
import { type HeatColumn, PillarHeatmap } from './performance-pillar-heatmap.tsx';
import { BandLegend, KpiTile } from './performance-score-bits.tsx';
import { groupScoreColumns, PersonCell, totalColumn } from './performance-score-table.tsx';

const REVIEW_STATUS: Record<
  ReviewStatus,
  { label: string; variant: 'success' | 'warning' | 'neutral' }
> = {
  reviewed: { label: 'Reviewed', variant: 'success' },
  pending: { label: 'Pending', variant: 'warning' },
  locked: { label: 'Locked', variant: 'neutral' },
};

// ---- Project drill: members + team lead to evaluate ---------------------

function ProjectDrillPanel({
  groups,
  project,
}: {
  groups: readonly PerformanceGroupAxis[];
  project: ProjectDrill;
}) {
  const columns = useMemo<TableColumn<MemberRow & Record<string, unknown>>[]>(
    () => [
      {
        key: 'name',
        header: 'Member',
        width: proportional(2),
        renderCell: (m) => (
          <PersonCell
            name={m.name}
            role={m.role}
            badge={m.is_team_lead ? <Badge variant="blue" label="Team Lead" /> : undefined}
          />
        ),
      },
      ...groupScoreColumns<MemberRow & Record<string, unknown>>(groups, (m) => m.scores),
      totalColumn<MemberRow & Record<string, unknown>>((m) => m.total),
      {
        key: 'review',
        header: 'Review',
        align: 'end',
        width: pixel(132),
        renderCell: (m) => {
          // The Team Lead is the person the AM evaluates — action lives on their row.
          if (m.is_team_lead) {
            return (
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant={m.eval_status === 'evaluated' ? 'ghost' : 'primary'}
                  label={m.eval_status === 'evaluated' ? 'Edit review' : 'Evaluate'}
                />
              </div>
            );
          }
          const s = REVIEW_STATUS[m.review_status];
          return (
            <div className="flex justify-end">
              <Badge variant={s.variant} label={s.label} />
            </div>
          );
        },
      },
    ],
    [groups],
  );

  return (
    <VStack gap={2}>
      <Text as="h3" size="base" weight="semibold">
        {project.project_name} — pillar scores per member
      </Text>
      <Table<MemberRow & Record<string, unknown>>
        data={project.members as (MemberRow & Record<string, unknown>)[]}
        columns={columns}
        idKey="member_id"
        density="balanced"
        hasHover
        data-testid="members-table"
      />
    </VStack>
  );
}

// ---- Dashboard ----------------------------------------------------------

export function PerformanceAmDashboard({
  groups,
  accountLabel,
  month,
}: {
  /** The account's configured evaluation groups (from the config API). */
  groups: readonly PerformanceGroupAxis[];
  accountLabel: string;
  month: string;
}) {
  const cycleLabel = formatPerformanceMonth(month);
  const data: AmDashboardData = useMemo(
    () => amDashboardFixture(groups, accountLabel, cycleLabel),
    [groups, accountLabel, cycleLabel],
  );
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const active = selectedProject
    ? (data.projects.find((p) => p.project_id === selectedProject) ?? null)
    : null;

  const heatColumns: HeatColumn[] = data.projects.map((pr) => ({
    id: pr.project_id,
    title: pr.project_name,
    subtitle: `${pr.member_count} ppl · ${pr.team_lead_name} ▸`,
    scores: pr.scores,
    overall: pr.overall,
  }));

  return (
    <VStack gap={4} data-testid="performance-home">
      {/* KPI row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiTile
          label="Team Leads to review"
          value={`${data.kpis.team_leads_to_review}`}
          hint={`of ${data.kpis.team_leads_total} on ${data.account_label}`}
        />
        <KpiTile label="Projects" value={`${data.kpis.projects}`} hint="active this cycle" />
        <KpiTile
          label="Account average"
          value={data.kpis.account_avg.toFixed(1)}
          hint="weighted, 1–5 scale"
        />
      </div>

      {/* One cohesive block: heatmap → legend → project drill */}
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

          <PillarHeatmap
            groups={data.groups}
            columns={heatColumns}
            selectedId={selectedProject}
            onSelect={(id) => setSelectedProject((cur) => (cur === id ? null : id))}
          />

          <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
            <BandLegend />
            {active ? null : (
              <Text size="xsm" color="secondary">
                Select a project column to drill in ▸
              </Text>
            )}
          </HStack>

          {active ? (
            <>
              <Divider />
              <ProjectDrillPanel groups={data.groups} project={active} />
            </>
          ) : null}
        </VStack>
      </Card>
    </VStack>
  );
}
