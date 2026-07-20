import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  fetchAccounts,
  fetchProjects,
  fetchWeeklyReports,
  type WeeklyReportCard,
} from '../api/pm-client.ts';
import { pmKeys } from '../state/query-keys.ts';
import {
  Badge,
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
  Skeleton,
} from './_ui-compat.tsx';
import { formatMetricValue, KPI_CATEGORIES, KPI_CATEGORY_LABELS } from './kpi-shared.tsx';
import { usePmContext } from './use-pm-context.ts';
import {
  colourBadge,
  colourDotClass,
  WeeklyReportDetailDialog,
} from './weekly-report-detail-dialog.tsx';

export interface WeeklyReportsSearch {
  account?: string;
  project?: string;
  iso_year?: number;
  iso_week?: number;
}

function statsLine(card: WeeklyReportCard): string {
  const s = card.stats;
  const parts = [`${s.measured_count}/${s.applied_count} KPIs in norm`];
  if (s.yellow_count > 0) parts.push(`${s.yellow_count} Yellow`);
  if (s.red_count > 0) parts.push(`${s.red_count} Red`);
  if (s.worst) {
    const value =
      s.worst.computed_value === null
        ? '—'
        : formatMetricValue(s.worst.computed_value, s.worst.name, s.worst.component_count);
    parts.push(`worst: ${s.worst.name} ${value}`);
  }
  return parts.join(' · ');
}

export function WeeklyReportsPage() {
  const { search, setSearch, weeks, iso_year, iso_week } = usePmContext('/pm/weekly');

  const accountsQuery = useQuery({ queryKey: pmKeys.accounts(), queryFn: fetchAccounts });
  const projectsQuery = useQuery({ queryKey: pmKeys.projects(), queryFn: fetchProjects });
  const listQuery = useQuery({
    queryKey: pmKeys.weeklyReports({
      iso_year,
      iso_week,
      account: search.account,
      project: search.project,
    }),
    queryFn: () =>
      fetchWeeklyReports({
        iso_year,
        iso_week,
        account_id: search.account,
        project_id: search.project,
      }),
  });

  // id null = the composer was opened without an explicit project context — the dialog
  // prompts for one instead of silently defaulting (FUT-589 AC1).
  const [detailProject, setDetailProject] = useState<{
    id: string | null;
    compose: boolean;
  } | null>(null);

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
  const manageableOptions = useMemo(
    () =>
      (projectsQuery.data ?? [])
        .filter((p) => p.can_manage)
        .map((p) => ({ value: p.project_id, label: p.name })),
    [projectsQuery.data],
  );
  // Disable-with-reason (app-wide convention) — only once projects have loaded, so the
  // button doesn't flash a false "no access" tooltip during the initial fetch.
  const cannotReport = projectsQuery.data !== undefined && manageableOptions.length === 0;

  const cards = listQuery.data ?? [];

  return (
    <PageChrome
      title="Weekly Reports"
      subtitle="QCDP follows the norms in KPI Metrics · KPI Norm — overall = worst pillar; non-Green requires a Road-to-Green action."
      actions={
        <DisabledActionTooltip
          disabled={cannotReport}
          reason="You do not manage any project, so there is nothing to report on."
        >
          <Button
            disabled={cannotReport}
            onClick={() => {
              // Straight into the composer — the filtered project when manageable, else the
              // first manageable one; the PROJECT dropdown at the top of the form keeps the
              // context explicit and switchable (same pattern as Manual KPI input).
              const preset =
                manageableOptions.find((o) => o.value === search.project) ?? manageableOptions[0];
              if (preset) setDetailProject({ id: preset.value, compose: true });
            }}
          >
            + New weekly report
          </Button>
        </DisabledActionTooltip>
      }
    >
      <div className="space-y-4 p-6">
        {/* Sticky context selector (FUT-589) — the (Project, Week) pair stays visible while
            the card grid scrolls under it. */}
        <div className="sticky top-0 z-10 -mx-6 -mt-6 flex flex-wrap items-end gap-3 border-b border-hairline bg-canvas px-6 py-4">
          <div className="space-y-1">
            <div className="text-xs text-secondary">Week</div>
            <Select
              value={`${iso_year}-${iso_week}`}
              onValueChange={(v) => {
                const [y, w] = v.split('-').map(Number);
                if (y !== undefined && w !== undefined) setSearch({ iso_year: y, iso_week: w });
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
        </div>

        {listQuery.isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Skeleton className="h-44 w-full" />
            <Skeleton className="h-44 w-full" />
            <Skeleton className="h-44 w-full" />
          </div>
        ) : cards.length === 0 ? (
          <EmptyState title="No projects for this week" />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => (
              <button
                type="button"
                key={card.project_id}
                onClick={() => setDetailProject({ id: card.project_id, compose: false })}
                className="rounded-lg border border-hairline bg-canvas p-4 text-left transition-colors hover:border-primary"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-primary">{card.project_name}</div>
                    <div className="truncate text-xs text-secondary">
                      {card.account_name}
                      {card.pm_name ? ` · PM ${card.pm_name}` : ''}
                      {card.pmo_name ? ` · PMO ${card.pmo_name}` : ''}
                    </div>
                  </div>
                  {colourBadge(card.overall_colour)}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  {KPI_CATEGORIES.map((cat) => (
                    <span key={cat} className="flex items-center gap-1 text-xs text-secondary">
                      <span className={colourDotClass(card.category_colours[cat])} />
                      {KPI_CATEGORY_LABELS[cat].split(' ')[0]}
                    </span>
                  ))}
                </div>

                <p className="mt-2 text-xs text-secondary">{statsLine(card)}</p>

                {card.latest_summary ? (
                  <p className="mt-2 line-clamp-2 text-sm text-primary">{card.latest_summary}</p>
                ) : (
                  // The empty line doubles as the invitation — the whole card opens the
                  // report dialog, so tell managers that's one click away.
                  <p className="mt-2 text-sm text-secondary">
                    No report yet{card.can_manage ? ' — click to write one' : ''}
                  </p>
                )}

                {card.report_count > 0 ? (
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex flex-wrap gap-1">
                      {card.reporters.map((r) => (
                        <Badge key={r.reporter_id} variant="secondary" className="font-normal">
                          {r.name ?? 'Unknown'}
                        </Badge>
                      ))}
                    </div>
                    <span className="text-xs text-secondary">
                      {card.report_count} report{card.report_count === 1 ? '' : 's'}
                    </span>
                  </div>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </div>

      {detailProject ? (
        <WeeklyReportDetailDialog
          // Keyed by project so switching in the composer's PROJECT dropdown remounts the
          // dialog with fresh form state prefilled from the new project.
          key={detailProject.id ?? 'pick-project'}
          project_id={detailProject.id}
          startInCompose={detailProject.compose}
          iso_year={iso_year}
          iso_week={iso_week}
          projectOptions={detailProject.compose ? manageableOptions : undefined}
          onProjectChange={(id) => setDetailProject({ id, compose: true })}
          onOpenChange={(open) => {
            if (!open) setDetailProject(null);
          }}
        />
      ) : null}
    </PageChrome>
  );
}
