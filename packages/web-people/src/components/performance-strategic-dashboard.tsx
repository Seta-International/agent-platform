import { Card, Divider, HStack, Text, VStack } from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { performanceRollupOptions } from '../api/performance-query.ts';
import { formatScore, scoreBand } from '../lib/performance-scores.ts';
import { formatPerformanceMonth } from '../nav/performance-dashboard.ts';
import { type HeatColumn, PillarHeatmap } from './performance-pillar-heatmap.tsx';
import { CycleEmptyNote, RollupBoundary } from './performance-rollup-boundary.tsx';
import { BandLegend, bandTextColor, KpiTile } from './performance-score-bits.tsx';

/**
 * Org-tier Reviews home (PMO / BoD / admin). One level above the AM view: columns are
 * accounts, and clicking one drills into its projects. The pillar axis spans every
 * account, so its weights are the roll-up's average of the accounts' own configs.
 */
export function PerformanceStrategicDashboard({ month }: { month: string }) {
  const query = useQuery(performanceRollupOptions({ month, scope: 'org' }));
  const cycleLabel = formatPerformanceMonth(month);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);

  return (
    <RollupBoundary query={query}>
      {(rollup) => {
        const active = selectedAccount
          ? (rollup.rows.find((a) => a.id === selectedAccount) ?? null)
          : null;

        const accountColumns: HeatColumn[] = rollup.rows.map((a) => ({
          id: a.id,
          title: a.name,
          subtitle: `${a.member_count} ppl · ${a.children.length} prj ▸`,
          scores: a.scores,
          overall: a.overall,
        }));

        const projectColumns: HeatColumn[] = (active?.children ?? []).map((p) => ({
          id: p.id,
          title: p.name,
          subtitle: `${p.member_count} ppl · ${p.subtitle || 'no lead'}`,
          scores: p.scores,
          overall: p.overall,
        }));

        const peopleInDelivery = rollup.rows.reduce((s, a) => s + a.member_count, 0);
        const avgColor =
          rollup.overall == null ? undefined : bandTextColor(scoreBand(rollup.overall));

        return (
          <VStack gap={4} data-testid="performance-home">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiTile
                label="Evaluations submitted"
                value={`${rollup.scored}/${rollup.total}`}
                hint="across every account"
                valueColor="var(--color-text-blue)"
              />
              <KpiTile
                label="Accounts"
                value={`${rollup.rows.length}`}
                hint={`${peopleInDelivery} people in delivery`}
                valueColor="var(--color-text-blue)"
              />
              <KpiTile
                label="Company avg score"
                value={formatScore(rollup.overall)}
                hint={`weighted across ${rollup.groups.length} pillars`}
                valueColor={avgColor}
              />
              <KpiTile
                label="Cycle"
                value={cycleLabel}
                hint="monthly performance"
                valueColor="var(--color-text-blue)"
              />
            </div>

            <Card padding={4}>
              <VStack gap={3}>
                <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
                  <Text as="h2" size="lg" weight="semibold">
                    Pillar scores by account
                  </Text>
                  <Text size="sm" color="secondary">
                    heatmap 1–5 · click an account to drill into its projects
                  </Text>
                </HStack>

                {rollup.rows.length === 0 ? (
                  <Text color="secondary">No account has anyone allocated this cycle.</Text>
                ) : (
                  <PillarHeatmap
                    groups={rollup.groups}
                    columns={accountColumns}
                    selectedId={selectedAccount}
                    onSelect={(id) => setSelectedAccount((cur) => (cur === id ? null : id))}
                  />
                )}

                <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
                  <BandLegend />
                  {active ? null : (
                    <Text size="xsm" color="secondary">
                      Select an account column to drill in ▸
                    </Text>
                  )}
                </HStack>
                <CycleEmptyNote scored={rollup.scored} total={rollup.total} />

                {active ? (
                  <>
                    <Divider />
                    <VStack gap={2}>
                      <Text as="h3" size="base" weight="semibold">
                        {active.name} — by project
                      </Text>
                      {/* Static rollup — the project columns are read-only, no further drill. */}
                      <PillarHeatmap
                        groups={rollup.groups}
                        columns={projectColumns}
                        selectedId={null}
                      />
                    </VStack>
                  </>
                ) : null}
              </VStack>
            </Card>
          </VStack>
        );
      }}
    </RollupBoundary>
  );
}
