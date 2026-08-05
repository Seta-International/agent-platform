import {
  Banner,
  BreadcrumbItem,
  Breadcrumbs,
  HStack,
  Layout,
  LayoutContent,
  LayoutHeader,
  Text,
  VStack,
} from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  fetchAccounts,
  fetchKpiExplorer,
  fetchKpiNorm,
  fetchProjects,
  type KpiExplorerRow,
} from '../api/pm-client.ts';
import { pmKeys } from '../state/query-keys.ts';
import {
  Button,
  DisabledActionTooltip,
  EmptyState,
  Selector,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from './_ui-compat.tsx';
import { KpiConfigureDialog } from './kpi-configure-dialog.tsx';
import { type ExplorerColumn, KpiExplorerTable } from './kpi-explorer-table.tsx';
import { KpiNormTab } from './kpi-norm-tab.tsx';
import {
  formatBand,
  isReportingWeekOpen,
  KPI_CATEGORIES,
  KPI_CATEGORY_LABELS,
  metricValueText,
  ragBadge,
  shortMetricLabel,
} from './kpi-shared.tsx';
import { usePmContext } from './use-pm-context.ts';

export interface KpiMetricsSearch {
  tab?: 'explorer' | 'norm';
  account?: string;
  project?: string;
  iso_year?: number;
  iso_week?: number;
}

const MANUAL_ENTRY_SOON = 'Coming soon — manual KPI entry is not available yet.';

const FROZEN_CELL = 'sticky z-10 bg-card transition-colors group-hover:bg-muted';
const FROZEN_START_WIDTH = 192 + 144 + 96;
const ACTION_COL_WIDTH = 80;

const PIN = {
  project: {
    header: 'left-0 z-30 w-48 min-w-48 max-w-48',
    cell: `${FROZEN_CELL} left-0 w-48 min-w-48 max-w-48`,
  },
  account: {
    header: 'left-48 z-30 w-36 min-w-36 max-w-36',
    cell: `${FROZEN_CELL} left-48 w-36 min-w-36 max-w-36`,
  },
  health: {
    header: 'left-84 z-30 w-24 min-w-24 max-w-24 border-r border-border',
    cell: `${FROZEN_CELL} left-84 w-24 min-w-24 max-w-24 border-r border-border`,
  },
  actions: {
    header: 'right-0 z-30 w-20 min-w-20 max-w-20 border-l border-border bg-surface',
    cell: `${FROZEN_CELL} right-0 w-20 min-w-20 max-w-20 border-l border-border`,
  },
  groupLabel: 'left-114',
};

export function KpiMetricsPage() {
  const { search, setSearch, weeks, iso_year, iso_week, weekReady } = usePmContext('/pm/metrics');
  const tab = (search as Partial<KpiMetricsSearch>).tab ?? 'explorer';

  const accountsQuery = useQuery({ queryKey: pmKeys.accounts(), queryFn: fetchAccounts });
  const projectsQuery = useQuery({ queryKey: pmKeys.projects(), queryFn: fetchProjects });
  const normQuery = useQuery({ queryKey: pmKeys.kpiNorm(), queryFn: fetchKpiNorm });
  const manageableProjects = useMemo(
    () => (projectsQuery.data ?? []).filter((p) => p.can_manage),
    [projectsQuery.data],
  );
  const managesNothing = manageableProjects.length === 0;
  const viewingCurrentWeek = weeks[0]?.iso_year === iso_year && weeks[0]?.iso_week === iso_week;
  const weekIsOpen = isReportingWeekOpen(iso_year, iso_week, weeks[0]);
  const canConfigure = !managesNothing && weekReady && viewingCurrentWeek && weekIsOpen;

  const [configureOpen, setConfigureOpen] = useState(false);

  const explorerQuery = useQuery({
    queryKey: pmKeys.kpiExplorer({
      iso_year,
      iso_week,
      account: search.account,
      project: search.project,
    }),
    queryFn: () =>
      fetchKpiExplorer({
        iso_year,
        iso_week,
        account_id: search.account,
        project_id: search.project,
      }),
  });

  const weekOptions = useMemo(
    () => weeks.map((w) => ({ value: `${w.iso_year}-${w.iso_week}`, label: w.label })),
    [weeks],
  );
  const accountOptions = useMemo(
    () => (accountsQuery.data ?? []).map((a) => ({ value: a.account_id, label: a.name })),
    [accountsQuery.data],
  );
  const projectsInAccount = useMemo(
    () =>
      (projectsQuery.data ?? []).filter((p) => !search.account || p.account_id === search.account),
    [projectsQuery.data, search.account],
  );
  const projectOptions = useMemo(
    () => projectsInAccount.map((p) => ({ value: p.project_id, label: p.name })),
    [projectsInAccount],
  );

  const appliedIds = explorerQuery.data?.applied_metric_ids ?? [];

  const appliedSummary = useMemo(() => {
    const metricList = normQuery.data?.metrics ?? [];
    const appliedSet = new Set(appliedIds);
    const core = metricList.filter((m) => m.tier === 'core' && appliedSet.has(m.metric_id)).length;
    const extended = metricList.filter(
      (m) => m.tier === 'extended' && appliedSet.has(m.metric_id),
    ).length;
    return { total: metricList.length, applied: appliedIds.length, core, extended };
  }, [appliedIds, normQuery.data]);

  const rows = explorerQuery.data?.rows ?? [];
  const weekLabel =
    weeks.find((w) => w.iso_year === iso_year && w.iso_week === iso_week)?.label ??
    `${iso_year}-W${String(iso_week).padStart(2, '0')}`;
  const nothingEntered =
    !explorerQuery.isLoading && rows.length > 0 && rows.every((r) => r.record_id === null);
  const soleEntryTarget = rows.length === 1 && rows[0]?.can_manage ? rows[0] : null;
  const selectedAccount =
    search.account ??
    (search.project
      ? (projectsQuery.data ?? []).find((p) => p.project_id === search.project)?.account_id
      : undefined) ??
    '';
  const configurableProjects = useMemo(
    () =>
      selectedAccount
        ? manageableProjects.filter((p) => p.account_id === selectedAccount)
        : manageableProjects,
    [manageableProjects, selectedAccount],
  );

  type Ctx = { row: { original: KpiExplorerRow } };

  const visibleMetrics = useMemo(() => explorerQuery.data?.metrics ?? [], [explorerQuery.data]);

  const metricColumnGroups = useMemo(
    () =>
      KPI_CATEGORIES.map((cat) => {
        const catMetrics = visibleMetrics.filter((m) => m.category === cat);
        if (catMetrics.length === 0) return null;
        return {
          id: `cat-${cat}`,
          header: () => (
            <span className={`sticky ${PIN.groupLabel} inline-block bg-surface pr-3`}>
              {KPI_CATEGORY_LABELS[cat]}
            </span>
          ),
          meta: { headerClassName: 'text-left' },
          columns: catMetrics.map((m) => ({
            id: m.metric_id,
            meta: {
              headerClassName: 'text-right whitespace-nowrap',
              cellClassName: 'text-right tabular-nums whitespace-nowrap',
            },
            header: () => (
              <div className="whitespace-nowrap" title={`${m.name} — Green target`}>
                <div className="text-primary">{shortMetricLabel(m.name).toUpperCase()}</div>
                <div className="font-normal normal-case tracking-normal text-success">
                  {formatBand(m.name, m.component_count, m.green_band)}
                </div>
              </div>
            ),
            cell: ({ row }: Ctx) => {
              const cell = row.original.metrics[m.metric_id];
              if (cell === undefined) {
                return <span className="text-secondary">—</span>;
              }
              return metricValueText(cell, m.name, m.component_count);
            },
          })),
        };
      }).filter((g): g is NonNullable<typeof g> => g !== null),
    [visibleMetrics],
  );

  const columns = useMemo<ExplorerColumn<KpiExplorerRow>[]>(
    () => [
      {
        id: 'project_name',
        accessorKey: 'project_name',
        header: 'Project',
        meta: { headerClassName: PIN.project.header, cellClassName: PIN.project.cell },
        cell: ({ row }: Ctx) => (
          <span className="truncate font-medium text-primary">{row.original.project_name}</span>
        ),
      },
      {
        accessorKey: 'account_name',
        header: 'Account',
        meta: { headerClassName: PIN.account.header, cellClassName: PIN.account.cell },
      },
      {
        id: 'overall_health',
        header: 'Health',
        meta: { headerClassName: PIN.health.header, cellClassName: PIN.health.cell },
        cell: ({ row }: Ctx) =>
          ragBadge(row.original.record_id === null ? null : row.original.overall_health),
      },
      ...metricColumnGroups,
      {
        id: 'actions',
        header: 'Action',
        meta: {
          headerClassName: PIN.actions.header,
          cellClassName: PIN.actions.cell,
        },
        cell: ({ row }: Ctx) =>
          row.original.can_manage ? (
            <DisabledActionTooltip disabled reason={MANUAL_ENTRY_SOON}>
              <Button size="sm" variant="ghost" disabled>
                {weekIsOpen ? 'Edit' : 'View'}
              </Button>
            </DisabledActionTooltip>
          ) : null,
      },
    ],
    [metricColumnGroups, weekIsOpen],
  );

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={1}>
            <Breadcrumbs variant="supporting">
              <BreadcrumbItem href="/pm">Project Monitoring</BreadcrumbItem>
              <BreadcrumbItem isCurrent>KPI Metrics</BreadcrumbItem>
            </Breadcrumbs>
            <HStack
              hAlign="between"
              vAlign="center"
              gap={2}
              style={{ minHeight: 'var(--size-element-md)' }}
            >
              <Text as="h1" size="lg" weight="semibold">
                KPI Metrics
              </Text>
              {tab === 'explorer' ? (
                <DisabledActionTooltip
                  disabled={!canConfigure}
                  reason={
                    managesNothing
                      ? 'You do not manage any project — configuring applied metrics needs manage rights.'
                      : !weekReady
                        ? 'Still loading which week it is. Configuring needs the current week to warn you about figures already entered.'
                        : !viewingCurrentWeek
                          ? `You are viewing ${weekLabel}. Applied metrics are configured on the current week — switch to it to change them.`
                          : `${weekLabel} closed for entry on Friday 17:00 (Asia/Ho_Chi_Minh), so its metric set is frozen. Configuring reopens on Monday and applies from next week.`
                  }
                >
                  <Button
                    variant="secondary"
                    disabled={!canConfigure}
                    onClick={() => setConfigureOpen(true)}
                  >
                    Configure metrics
                  </Button>
                </DisabledActionTooltip>
              ) : null}
            </HStack>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
          <div className="flex h-full flex-col p-6">
            <Tabs
              className="flex min-h-0 flex-1 flex-col"
              value={tab}
              onValueChange={(v) => setSearch({ tab: v === 'norm' ? 'norm' : 'explorer' })}
            >
              <TabsList className="self-start">
                <TabsTrigger value="explorer">KPI Explorer</TabsTrigger>
                <TabsTrigger value="norm">KPI Norm</TabsTrigger>
              </TabsList>

              <TabsContent value="explorer" className="flex min-h-0 flex-1 flex-col gap-4">
                <div className="flex shrink-0 flex-wrap items-end gap-3">
                  <Selector
                    label="Week"
                    size="sm"
                    width={200}
                    options={weekOptions}
                    value={`${iso_year}-${iso_week}`}
                    onChange={(v) => {
                      const [y, w] = v.split('-').map(Number);
                      if (y !== undefined && w !== undefined)
                        setSearch({ iso_year: y, iso_week: w });
                    }}
                  />
                  <Selector
                    label="Account"
                    size="sm"
                    width={208}
                    options={[{ value: '', label: 'All accounts' }, ...accountOptions]}
                    value={selectedAccount}
                    onChange={(v) => setSearch({ account: v || undefined, project: undefined })}
                  />
                  <Selector
                    label="Project"
                    size="sm"
                    width={240}
                    options={[{ value: '', label: 'All projects' }, ...projectOptions]}
                    value={search.project ?? ''}
                    onChange={(v) => setSearch({ project: v || undefined })}
                  />
                </div>

                {nothingEntered ? (
                  <Banner
                    status="info"
                    container="card"
                    title={`No KPI figures entered for ${weekLabel}`}
                    description={
                      !weekIsOpen
                        ? 'This week is closed, so its figures stay view-only.'
                        : soleEntryTarget
                          ? 'Entry closes Friday 17:00 (Asia/Ho_Chi_Minh).'
                          : 'Entry closes Friday 17:00 (Asia/Ho_Chi_Minh). Open a project to enter its numbers.'
                    }
                    endContent={
                      weekIsOpen && soleEntryTarget ? (
                        <DisabledActionTooltip disabled reason={MANUAL_ENTRY_SOON}>
                          <Button variant="primary" disabled>
                            Enter weekly KPIs
                          </Button>
                        </DisabledActionTooltip>
                      ) : null
                    }
                  />
                ) : null}

                <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
                  <KpiExplorerTable
                    data={rows}
                    columns={columns}
                    isLoading={explorerQuery.isLoading}
                    emptyState={<EmptyState title="No projects for this week" />}
                    getRowKey={(row) => row.project_id}
                    regionLabel={`KPI Explorer, ${weekLabel} — scroll sideways for the remaining metric columns`}
                    pinnedStartWidth={FROZEN_START_WIDTH}
                    pinnedEndWidth={ACTION_COL_WIDTH}
                  />
                </div>

                <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-1 text-xs text-secondary">
                  <p>
                    {appliedSummary.applied} of {appliedSummary.total} library metrics applied to
                    this view ({appliedSummary.core} core, {appliedSummary.extended} extended).
                  </p>
                  <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="flex items-center gap-1.5">
                      <span aria-hidden="true">·</span> No figure entered
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span aria-hidden="true">—</span> Metric not applied to this project
                    </span>
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="norm" className="min-h-0 flex-1 overflow-auto">
                <KpiNormTab norm={normQuery.data ?? null} isLoading={normQuery.isLoading} />
              </TabsContent>
            </Tabs>
          </div>

          {configureOpen ? (
            <KpiConfigureDialog
              open={configureOpen}
              onOpenChange={setConfigureOpen}
              projects={configurableProjects}
              initialProjectId={search.project}
              currentWeek={weeks[0]}
            />
          ) : null}
        </LayoutContent>
      }
    />
  );
}
