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
  Combobox,
  DisabledActionTooltip,
  EmptyState,
  PageChrome,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
  recordStatusBadge,
  shortMetricLabel,
} from './kpi-shared.tsx';
import { usePmContext } from './use-pm-context.ts';
import { WeeklyReportDetailDialog } from './weekly-report-detail-dialog.tsx';

export interface KpiMetricsSearch {
  tab?: 'explorer' | 'norm';
  account?: string;
  project?: string;
  iso_year?: number;
  iso_week?: number;
}

// Category band colours (mock: Q green, C amber, D blue, P purple). The group header wears
// the strong tint; its metric sub-headers and every body cell wear a washed-out version of
// the same hue, so the grouping stays visible while scrolling without drowning the RAG
// colours of the values themselves.
// Identity columns stay pinned while the metric columns scroll horizontally. Sticky cells
// must be opaque (scrolled content would bleed through), so they carry their own background
// and mirror the row hover via group-hover. Fixed widths make the cumulative left offsets
// reliable: project 12rem → account at left-[12rem] (9rem) → health at left-[21rem] (7rem).
const PIN = {
  project: {
    header: 'left-0 z-30 w-48 min-w-48 max-w-48',
    cell: 'sticky left-0 z-10 w-48 min-w-48 max-w-48 bg-canvas group-hover:bg-surface-2 transition-colors',
  },
  account: {
    header: 'left-[12rem] z-30 w-36 min-w-36 max-w-36',
    cell: 'sticky left-[12rem] z-10 w-36 min-w-36 max-w-36 bg-canvas group-hover:bg-surface-2 transition-colors',
  },
  health: {
    header: 'left-[21rem] z-30 w-28 min-w-28 max-w-28 border-r border-hairline',
    cell: 'sticky left-[21rem] z-10 w-28 min-w-28 max-w-28 bg-canvas group-hover:bg-surface-2 transition-colors border-r border-hairline',
  },
};

const CATEGORY_STYLES: Record<string, { band: string; column: string }> = {
  quality: {
    band: 'bg-success-muted text-success',
    column: 'bg-success-muted/35',
  },
  cost_capacity: {
    band: 'bg-warning-muted text-warning',
    column: 'bg-warning-muted/35',
  },
  delivery: {
    band: 'bg-info-tint text-blue-vivid',
    column: 'bg-info-tint/35',
  },
  process: {
    band: 'bg-group-theme-purple/15 text-secondary',
    column: 'bg-group-theme-purple/5',
  },
};

export function KpiMetricsPage() {
  const { search, setSearch, weeks, iso_year, iso_week } = usePmContext('/pm/metrics');
  const tab = (search as Partial<KpiMetricsSearch>).tab ?? 'explorer';

  const accountsQuery = useQuery({ queryKey: pmKeys.accounts(), queryFn: fetchAccounts });
  const projectsQuery = useQuery({ queryKey: pmKeys.projects(), queryFn: fetchProjects });
  const normQuery = useQuery({ queryKey: pmKeys.kpiNorm(), queryFn: fetchKpiNorm });
  const canConfigure = (projectsQuery.data ?? []).some((p) => p.can_manage);

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

  const [configureOpen, setConfigureOpen] = useState(false);
  const [manualInput, setManualInput] = useState<{
    project_id: string;
    iso_year: number;
    iso_week: number;
  } | null>(null);
  // Clicking a project name drills down into the same weekly-report modal Weekly Reports uses
  // (functional-analysis.md §8b: both screens open the same detail content).
  const [detailProject, setDetailProject] = useState<string | null>(null);

  const accountOptions = useMemo(
    () => (accountsQuery.data ?? []).map((a) => ({ value: a.account_id, label: a.name })),
    [accountsQuery.data],
  );
  const projectOptions = useMemo(
    () =>
      (projectsQuery.data ?? [])
        .filter((p) => !search.account || p.account_id === search.account)
        .map((p) => ({ value: p.project_id, label: p.name })),
    [projectsQuery.data, search.account],
  );

  // Union of metrics applied to any project currently shown in Explorer — Configure metrics is
  // per-project, so different projects can carry different applied sets (functional-analysis.md
  // §2d); the backend computes this union from the actual visible rows.
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

  type Ctx = { row: { original: KpiExplorerRow } };

  // Explorer is the at-a-glance view, not the full ledger: it shows only Core metrics, capped
  // at the first 3 per category (norm order). Everything applied is still measured and visible
  // in Manual KPI input / the weekly-report drill-down — this only trims the columns.
  const visibleMetrics = useMemo(() => {
    const appliedSet = new Set(appliedIds);
    return (normQuery.data?.metrics ?? []).filter(
      (m) => m.tier === 'core' && appliedSet.has(m.metric_id),
    );
  }, [normQuery.data, appliedIds]);

  const metricColumnGroups = useMemo(
    () =>
      KPI_CATEGORIES.map((cat) => {
        // norm metrics arrive sorted by sort_order, so slice(0, 3) = the category's first 3 Core.
        const catMetrics = visibleMetrics.filter((m) => m.category === cat).slice(0, 3);
        if (catMetrics.length === 0) return null;
        const styles = CATEGORY_STYLES[cat] ?? { band: '', column: '' };
        return {
          id: `cat-${cat}`,
          header: KPI_CATEGORY_LABELS[cat],
          meta: { headerClassName: `${styles.band} text-center font-semibold` },
          columns: catMetrics.map((m) => ({
            id: m.metric_id,
            meta: { headerClassName: styles.column, cellClassName: styles.column },
            header: () => (
              // nowrap: the table already scrolls horizontally, so columns should widen
              // instead of breaking "ON-TIME ≥ 90%" across three lines.
              <div className="whitespace-nowrap">
                <div>{shortMetricLabel(m.name).toUpperCase()}</div>
                <div className="font-normal normal-case text-secondary">
                  {formatBand(m.name, m.component_count, m.green_band)}
                </div>
              </div>
            ),
            cell: ({ row }: Ctx) =>
              metricValueText(
                row.original.metrics[m.metric_id] ?? { value: null, status: null },
                m.name,
                m.component_count,
              ),
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
          <button
            type="button"
            className="cursor-pointer text-left font-medium text-primary underline-offset-2 hover:text-primary hover:underline"
            onClick={() => setDetailProject(row.original.project_id)}
          >
            {row.original.project_name}
          </button>
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
        id: 'record',
        header: 'Record',
        cell: ({ row }: Ctx) => recordStatusBadge(row.original.record_id !== null),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }: Ctx) =>
          row.original.can_manage ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setManualInput({ project_id: row.original.project_id, iso_year, iso_week })
              }
            >
              {/* A locked week opens the same dialog read-only — say so up front. */}
              {isReportingWeekOpen(iso_year, iso_week, weeks[0]) ? 'Edit' : 'View'}
            </Button>
          ) : null,
      },
    ],
    [iso_year, iso_week, metricColumnGroups, weeks],
  );

  return (
    <PageChrome
      title="KPI Metrics"
      subtitle="Pick a week and a project, then input or edit each KPI record — the table shows the stored values for that week."
      actions={
        <DisabledActionTooltip
          disabled={!canConfigure}
          reason="You do not manage any project — configuring applied metrics needs manage rights."
        >
          <Button
            variant="secondary"
            disabled={!canConfigure}
            onClick={() => setConfigureOpen(true)}
          >
            Configure metrics
          </Button>
        </DisabledActionTooltip>
      }
    >
      <div className="space-y-4 p-6">
        <Tabs
          value={tab}
          onValueChange={(v) => setSearch({ tab: v === 'norm' ? 'norm' : 'explorer' })}
        >
          <TabsList>
            <TabsTrigger value="explorer">KPI Explorer</TabsTrigger>
            <TabsTrigger value="norm">KPI Norm</TabsTrigger>
          </TabsList>

          <TabsContent value="explorer" className="space-y-4">
            {/* Sticky context selector (FUT-589) — the (Project, Week) pair stays visible
                while the wide Explorer table scrolls under it. */}
            <div className="sticky top-0 z-20 -mx-6 flex flex-wrap items-end gap-3 border-b border-hairline bg-canvas px-6 py-3">
              <div className="space-y-1">
                <div className="text-xs text-secondary">Week</div>
                <Select
                  value={`${iso_year}-${iso_week}`}
                  onValueChange={(v) => {
                    const [y, w] = v.split('-').map(Number);
                    setSearch({ iso_year: y, iso_week: w });
                  }}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {weeks.map((w) => (
                      <SelectItem
                        key={`${w.iso_year}-${w.iso_week}`}
                        value={`${w.iso_year}-${w.iso_week}`}
                      >
                        {w.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-secondary">Account</div>
                <Combobox
                  options={[{ value: '', label: 'All' }, ...accountOptions]}
                  value={search.account ?? ''}
                  onChange={(v) => setSearch({ account: v || undefined, project: undefined })}
                  className="w-52"
                  placeholder="All accounts"
                />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-secondary">Project</div>
                <Combobox
                  options={[{ value: '', label: 'All' }, ...projectOptions]}
                  value={search.project ?? ''}
                  onChange={(v) => setSearch({ project: v || undefined })}
                  className="w-52"
                  placeholder="All projects"
                />
              </div>
              {/* The one action on this screen sits apart from the filters, pinned right. */}
              <DisabledActionTooltip
                disabled={!canConfigure}
                reason="You do not manage any project — KPI records are read-only for you."
                className="ml-auto"
              >
                <Button
                  className={canConfigure ? 'ml-auto' : undefined}
                  onClick={() => {
                    // Straight into the form: the filtered project when manageable, else the
                    // first manageable one — the dialog's own Project select stays visible
                    // and editable, so the context is explicit without an extra pick step.
                    const manageable = (projectsQuery.data ?? []).filter((p) => p.can_manage);
                    const preset =
                      manageable.find((p) => p.project_id === search.project) ?? manageable[0];
                    setManualInput({
                      project_id: preset?.project_id ?? '',
                      iso_year,
                      iso_week,
                    });
                  }}
                  disabled={!canConfigure || (!search.project && projectOptions.length === 0)}
                >
                  Manual KPI input
                </Button>
              </DisabledActionTooltip>
            </div>

            {/* Table toolbar is off: free-text search duplicates the Project filter above, and
                the column-visibility menu would list metric columns by their UUID ids. Wide
                weeks scroll inside the table wrapper, never the page. */}
            <div className="overflow-x-auto">
              <KpiExplorerTable
                data={explorerQuery.data?.rows ?? []}
                columns={columns}
                isLoading={explorerQuery.isLoading}
                emptyState={<EmptyState title="No projects for this week" />}
                getRowKey={(row) => row.project_id}
              />
            </div>

            <p className="text-xs text-secondary">
              {appliedSummary.applied}/{appliedSummary.total} library metrics applied (
              {appliedSummary.core} core · {appliedSummary.extended} extended) · norm bands in KPI
              Norm.
            </p>
          </TabsContent>

          <TabsContent value="norm">
            <KpiNormTab
              norm={normQuery.data ?? null}
              appliedIds={new Set(appliedIds)}
              isLoading={normQuery.isLoading}
            />
          </TabsContent>
        </Tabs>
      </div>

      {configureOpen ? (
        <KpiConfigureDialog
          open={configureOpen}
          onOpenChange={setConfigureOpen}
          projects={(projectsQuery.data ?? []).filter((p) => p.can_manage)}
          initialProjectId={search.project}
        />
      ) : null}
      {manualInput ? (
        <KpiManualInputDialog
          initial={manualInput}
          projects={projectOptions}
          weeks={weeks}
          onOpenChange={(open) => {
            if (!open) setManualInput(null);
          }}
        />
      ) : null}
      {detailProject ? (
        <WeeklyReportDetailDialog
          project_id={detailProject}
          iso_year={iso_year}
          iso_week={iso_week}
          onOpenChange={(open) => {
            if (!open) setDetailProject(null);
          }}
        />
      ) : null}
    </PageChrome>
  );
}
