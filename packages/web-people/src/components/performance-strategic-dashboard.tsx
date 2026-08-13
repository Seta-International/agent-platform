import { Card, Divider, HStack, Text, VStack } from '@seta/shared-ui';
import { useMemo, useState } from 'react';
import { scoreBand } from '../mock/performance-scores.ts';
import {
  type StrategicDashboardData,
  strategicDashboardFixture,
} from '../mock/performance-strategic-fixture.ts';
import { formatPerformanceMonth } from '../nav/performance-dashboard.ts';
import { CycleUnlockPanel } from './cycle-unlock-panel.tsx';
import { type HeatColumn, PillarHeatmap } from './performance-pillar-heatmap.tsx';
import { BandLegend, bandTextColor, KpiTile } from './performance-score-bits.tsx';

/**
 * Org-tier Reviews home (PMO / BoD / admin). One level above the AM view:
 * columns are accounts; clicking an account drills into its projects. The pillar
 * axis is the tenant default (no per-account config at this tier — see the
 * fixture). Scores are mock until the scoring/rollup API lands.
 */
export function PerformanceStrategicDashboard({
  month,
  canUnlock = false,
}: {
  month: string;
  /** Holder of people.performance.unlock — shows the PMO manual-unlock panel (FUT-781). */
  canUnlock?: boolean;
}) {
  const cycleLabel = formatPerformanceMonth(month);
  const data: StrategicDashboardData = useMemo(
    () => strategicDashboardFixture(cycleLabel),
    [cycleLabel],
  );
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const active = selectedAccount
    ? (data.accounts.find((a) => a.account_id === selectedAccount) ?? null)
    : null;

  const accountColumns: HeatColumn[] = data.accounts.map((a) => ({
    id: a.account_id,
    title: a.account_name,
    subtitle: `${a.member_count} ppl · ${a.project_count} prj ▸`,
    scores: a.scores,
    overall: a.overall,
  }));

  const projectColumns: HeatColumn[] = active
    ? active.projects.map((p) => ({
        id: p.project_id,
        title: p.project_name,
        subtitle: `${p.member_count} ppl · ${p.team_lead_name}`,
        scores: p.scores,
        overall: p.overall,
      }))
    : [];

  const avgBand = scoreBand(data.kpis.company_avg);

  return (
    <VStack gap={4} data-testid="performance-home">
      {canUnlock ? <CycleUnlockPanel month={month} /> : null}

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="AM / Dept Heads to review"
          value={`${data.kpis.am_to_review}`}
          hint={`${data.kpis.am_evaluated} evaluated by BoD`}
          valueColor="var(--color-text-blue)"
        />
        <KpiTile
          label="Accounts"
          value={`${data.kpis.accounts}`}
          hint={`${data.kpis.people_in_delivery} people in delivery`}
          valueColor="var(--color-text-blue)"
        />
        <KpiTile
          label="Company avg score"
          value={data.kpis.company_avg.toFixed(2)}
          hint="weighted across 5 pillars"
          valueColor={bandTextColor(avgBand)}
        />
        <KpiTile
          label="Cycle"
          value={cycleLabel}
          hint="monthly performance"
          valueColor="var(--color-text-blue)"
        />
      </div>

      {/* One cohesive block: account heatmap → legend → account-by-project drill */}
      <Card padding={4}>
        <VStack gap={3}>
          <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
            <Text as="h2" size="lg" weight="semibold">
              Pillar scores by account
            </Text>
            <Text size="sm" color="secondary">
              heatmap 0–5 · click an account to drill into its projects
            </Text>
          </HStack>

          <PillarHeatmap
            groups={data.groups}
            columns={accountColumns}
            selectedId={selectedAccount}
            onSelect={(id) => setSelectedAccount((cur) => (cur === id ? null : id))}
          />

          <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
            <BandLegend />
            {active ? null : (
              <Text size="xsm" color="secondary">
                Select an account column to drill in ▸
              </Text>
            )}
          </HStack>

          {active ? (
            <>
              <Divider />
              <VStack gap={2}>
                <Text as="h3" size="base" weight="semibold">
                  {active.account_name} — by project
                </Text>
                {/* Static rollup — the project columns are read-only, no further drill. */}
                <PillarHeatmap groups={data.groups} columns={projectColumns} selectedId={null} />
              </VStack>
            </>
          ) : null}
        </VStack>
      </Card>
    </VStack>
  );
}
