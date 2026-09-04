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
import { Link } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
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
  MultiSelector,
  Selector,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from './_ui-compat.tsx';
import { KpiConfigureDialog } from './kpi-configure-dialog.tsx';
import { type ExplorerColumn, KpiExplorerTable } from './kpi-explorer-table.tsx';
import { KpiManualInputDialog } from './kpi-manual-input-dialog.tsx';
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
import { WeeklyReportDetailDialog } from './weekly-report-detail-dialog.tsx';

export interface KpiMetricsSearch {
  tab?: 'explorer' | 'norm';
  /** Comma-separated account ids; absent means every account the viewer can see. */
  accounts?: string;
  project?: string;
  iso_year?: number;
  iso_week?: number;
  detail?: string;
}

const splitAccounts = (v: unknown): string[] =>
  typeof v === 'string' ? v.split(',').flatMap((id) => (id.trim() ? [id.trim()] : [])) : [];
const joinAccounts = (ids: string[]): string | undefined =>
  ids.length ? ids.join(',') : undefined;

const FROZEN_CELL = 'sticky z-10 bg-card transition-colors group-hover:bg-muted';
const FROZEN_START_WIDTH = 192;
const ACTION_COL_WIDTH = 80;

const PIN = {
  project: {
    header: 'left-0 z-30 w-48 min-w-48 max-w-48',
    cell: `${FROZEN_CELL} left-0 w-48 min-w-48 max-w-48`,
  },
  account: {
    header: 'w-36 min-w-36 max-w-36',
    cell: 'w-36 min-w-36 max-w-36',
  },
  health: {
    header: 'w-24 min-w-24 max-w-24 border-r border-border',
    cell: 'w-24 min-w-24 max-w-24 border-r border-border',
  },
  actions: {
    header: 'right-0 z-30 w-20 min-w-20 max-w-20 border-l border-border bg-surface',
    cell: `${FROZEN_CELL} right-0 w-20 min-w-20 max-w-20 border-l border-border`,
  },
  groupLabel: 'left-54',
};

export function KpiMetricsPage() {
  const { search, setSearch, weeks, iso_year, iso_week, weekReady } = usePmContext('/pm/metrics');
  const tab = (search as Partial<KpiMetricsSearch>).tab ?? 'explorer';
  const accountsParam = (search as Partial<KpiMetricsSearch>).accounts;
  const accountIds = useMemo(() => splitAccounts(accountsParam), [accountsParam]);
  const detailProjectId =
    typeof search.detail === 'string' && search.detail ? search.detail : undefined;

  const detailSearch = useCallback(
    (project_id: string): KpiMetricsSearch => ({
      tab,
      accounts: accountsParam,
      project: search.project,
      iso_year,
      iso_week,
      detail: project_id,
    }),
    [tab, accountsParam, search.project, iso_year, iso_week],
  );

  const accountsQuery = useQuery({ queryKey: pmKeys.accounts(), queryFn: fetchAccounts });
  const projectsQuery = useQuery({ queryKey: pmKeys.projects(), queryFn: fetchProjects });
  const normQuery = useQuery({ queryKey: pmKeys.kpiNorm(), queryFn: fetchKpiNorm });
  const manageableProjects = useMemo(
    () => (projectsQuery.data ?? []).filter((p) => p.can_manage),
    [projectsQuery.data],
  );
  const configurableProjects = useMemo(() => {
    if (accountIds.length > 0) {
      const scope = new Set(accountIds);
      return manageableProjects.filter((p) => scope.has(p.account_id));
    }
    if (search.project) return manageableProjects.filter((p) => p.project_id === search.project);
    return manageableProjects;
  }, [manageableProjects, accountIds, search.project]);
  const scopedToOneProject = accountIds.length === 0 && search.project !== undefined;
  const managesNothing = manageableProjects.length === 0;
  const nothingToConfigure = configurableProjects.length === 0;
  const viewingCurrentWeek = weeks[0]?.iso_year === iso_year && weeks[0]?.iso_week === iso_week;
  const weekIsOpen = isReportingWeekOpen(iso_year, iso_week, weeks[0]);
  const canConfigure = !nothingToConfigure && weekReady && viewingCurrentWeek && weekIsOpen;

  const [configureOpen, setConfigureOpen] = useState(false);
  const [manualInput, setManualInput] = useState<{
    project_id: string;
    iso_year: number;
    iso_week: number;
  } | null>(null);

  const explorerQuery = useQuery({
    queryKey: pmKeys.kpiExplorer({
      iso_year,
      iso_week,
      accounts: accountsParam,
      project: search.project,
    }),
    queryFn: () =>
      fetchKpiExplorer({
        iso_year,
        iso_week,
        account_ids: accountIds,
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
  const accountNameById = useMemo(
    () => new Map((accountsQuery.data ?? []).map((a) => [a.account_id, a.name])),
    [accountsQuery.data],
  );
  const accountFilter = useMemo(() => new Set(accountIds), [accountIds]);
  const projectsInAccounts = useMemo(
    () =>
      (projectsQuery.data ?? []).filter(
        (p) => accountFilter.size === 0 || accountFilter.has(p.account_id),
      ),
    [projectsQuery.data, accountFilter],
  );
  // One account behaves like it always did — a flat list. Past that, a bare project name no
  // longer says whose project it is, so the options carry their account as a section heading.
  const projectOptions = useMemo(() => {
    if (accountFilter.size < 2)
      return projectsInAccounts.map((p) => ({ value: p.project_id, label: p.name }));
    const byAccount = new Map<string, Array<{ value: string; label: string }>>();
    for (const p of projectsInAccounts) {
      const list = byAccount.get(p.account_id) ?? [];
      list.push({ value: p.project_id, label: p.name });
      byAccount.set(p.account_id, list);
    }
    return [...byAccount.entries()]
      .map(([id, options]) => ({
        type: 'section' as const,
        title: accountNameById.get(id) ?? 'Unknown account',
        options,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [projectsInAccounts, accountFilter, accountNameById]);
  const entryProjectOptions = useMemo(
    () =>
      projectsInAccounts
        .filter((p) => p.can_report)
        .map((p) => ({ value: p.project_id, label: p.name })),
    [projectsInAccounts],
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
          <Link
            to="/pm/metrics"
            search={detailSearch(row.original.project_id)}
            onClick={(e) => e.stopPropagation()}
            title={row.original.project_name}
            className="block truncate font-medium text-primary underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {row.original.project_name}
          </Link>
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
        cell: ({ row }: Ctx) => ragBadge(row.original.overall_health),
      },
      ...metricColumnGroups,
      {
        id: 'actions',
        header: 'Action',
        meta: {
          headerClassName: PIN.actions.header,
          cellClassName: PIN.actions.cell,
        },
        cell: ({ row }: Ctx) => {
          if (!row.original.can_manage) return null;
          const label = !weekIsOpen ? 'View' : row.original.record_id === null ? 'Enter' : 'Edit';
          return (
            <DisabledActionTooltip
              disabled={!row.original.can_report}
              reason="Only this project’s EM or PMO enters its KPI figures — you manage this project but do not report on it."
            >
              <Button
                size="sm"
                variant="ghost"
                disabled={!row.original.can_report}
                onClick={(e) => {
                  e.stopPropagation();
                  setManualInput({ project_id: row.original.project_id, iso_year, iso_week });
                }}
              >
                {label}
              </Button>
            </DisabledActionTooltip>
          );
        },
      },
    ],
    [iso_year, iso_week, metricColumnGroups, weekIsOpen, detailSearch],
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
                      : nothingToConfigure
                        ? scopedToOneProject
                          ? 'You do not manage the project you filtered to. Clear the Project filter to configure the ones you do.'
                          : 'You do not manage any project in the accounts you filtered to. Clear the Account filter to configure the ones you do.'
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
              onValueChange={(v) =>
                setSearch({ tab: v === 'norm' ? 'norm' : 'explorer', detail: undefined })
              }
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
                  <MultiSelector
                    label="Account"
                    size="sm"
                    width={240}
                    placeholder="All accounts"
                    triggerDisplay="labels"
                    hasSearch
                    searchPlaceholder="Search accounts…"
                    hasClear
                    options={accountOptions}
                    value={accountIds}
                    onChange={(next) => {
                      const pickedAccount = (projectsQuery.data ?? []).find(
                        (p) => p.project_id === search.project,
                      )?.account_id;
                      const keepsProject =
                        next.length === 0 ||
                        (pickedAccount !== undefined && next.includes(pickedAccount));
                      setSearch({
                        accounts: joinAccounts(next),
                        project: keepsProject ? search.project : undefined,
                      });
                    }}
                  />
                  <Selector
                    label="Project"
                    size="sm"
                    width={240}
                    placeholder="All projects"
                    hasSearch
                    searchPlaceholder="Search projects…"
                    hasClear
                    options={projectOptions}
                    value={search.project ?? null}
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
                        : 'Entry closes Friday 17:00 (Asia/Ho_Chi_Minh). Open a project to enter its numbers.'
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
                    onRowClick={(row) => setSearch({ detail: row.project_id })}
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
              accountNames={accountNameById}
              initialProjectId={search.project}
              currentWeek={weeks[0]}
            />
          ) : null}
          {detailProjectId ? (
            <WeeklyReportDetailDialog
              key={detailProjectId}
              project_id={detailProjectId}
              iso_year={iso_year}
              iso_week={iso_week}
              openedFromExplorer
              onOpenChange={(open) => {
                if (!open) setSearch({ detail: undefined });
              }}
            />
          ) : null}
          {manualInput ? (
            <KpiManualInputDialog
              initial={manualInput}
              projects={entryProjectOptions}
              weeks={weeks}
              onOpenChange={(open) => {
                if (!open) setManualInput(null);
              }}
            />
          ) : null}
        </LayoutContent>
      }
    />
  );
}
