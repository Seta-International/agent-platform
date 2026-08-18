import {
  BreadcrumbItem,
  Breadcrumbs,
  Button,
  Card,
  ClickableCard,
  DisabledActionTooltip,
  EmptyState,
  Heading,
  HStack,
  Layout,
  LayoutContent,
  LayoutHeader,
  PaginationFooter,
  Selector,
  Skeleton,
  StatusDot,
  Text,
  VStack,
} from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { fetchAccounts, fetchProjects, fetchWeeklyReports } from '../api/pm-client.ts';
import { pmKeys } from '../state/query-keys.ts';
import {
  COLOUR_LABEL,
  COLOUR_VARIANT,
  type ColourKey,
  colourBadge,
  colourKey,
  formatBand,
  formatMetricValue,
  isoWeekBase,
  isReportingWeekOpen,
  KPI_CATEGORIES,
  KPI_CATEGORY_LABELS,
  markStyle,
} from './kpi-shared.tsx';
import { usePmContext } from './use-pm-context.ts';
import { WeeklyReportDetailDialog } from './weekly-report-detail-dialog.tsx';

export interface WeeklyReportsSearch {
  account?: string;
  project?: string;
  iso_year?: number;
  iso_week?: number;
  detail?: string;
}

// Colour budget: status colour appears only as small marks (dots, one verdict badge per card).
// Large chromatic surfaces made the board shout — Green is the norm and must stay quiet.

// The portfolio-health strip: one tile per outcome, always Green/Amber/Red; "No data" only
// when a project has no measured entries this week (so it never adds noise on a full board).
const SUMMARY_ORDER: ColourKey[] = ['green', 'yellow', 'red', 'gray', 'none'];

const PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [PAGE_SIZE, 25, 50, 100];

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
  const [composeProject, setComposeProject] = useState<{ id: string | null } | null>(null);
  const detailParam = typeof search.detail === 'string' ? search.detail : undefined;
  const openProject = composeProject ?? (detailParam ? { id: detailParam } : null);

  const weekOptions = useMemo(
    () => weeks.map((w) => ({ value: `${w.iso_year}-${w.iso_week}`, label: w.label })),
    [weeks],
  );
  const weekLabel = useMemo(
    () => weekOptions.find((w) => w.value === `${iso_year}-${iso_week}`)?.label ?? '',
    [weekOptions, iso_year, iso_week],
  );
  const accountOptions = useMemo(
    () => [
      { value: '', label: 'All accounts' },
      ...(accountsQuery.data ?? []).map((a) => ({ value: a.account_id, label: a.name })),
    ],
    [accountsQuery.data],
  );
  const projectOptions = useMemo(
    () => [
      { value: '', label: 'All projects' },
      ...(projectsQuery.data ?? [])
        .filter((p) => !search.account || p.account_id === search.account)
        .map((p) => ({ value: p.project_id, label: p.name })),
    ],
    [projectsQuery.data, search.account],
  );
  const manageableOptions = useMemo(
    () =>
      (projectsQuery.data ?? [])
        .filter((p) => p.can_report)
        .map((p) => ({ value: p.project_id, label: p.name })),
    [projectsQuery.data],
  );
  // Disable-with-reason (app-wide convention) — only once projects have loaded, so the
  // button doesn't flash a false "no access" tooltip during the initial fetch.
  const cannotReport = projectsQuery.data !== undefined && manageableOptions.length === 0;
  // Reports are only ever authored for the current week (weeks[0] is the server anchor) and
  // that week closes at Friday 17:00 VNT — the same Epic 3 gate the dialog reads off
  // `week_editable`, mirrored here so the button says why instead of opening a dead composer.
  const currentWeek = weeks[0];
  const notCurrentWeek =
    currentWeek !== undefined &&
    (currentWeek.iso_year !== iso_year || currentWeek.iso_week !== iso_week);
  const weekClosed =
    currentWeek !== undefined && !isReportingWeekOpen(iso_year, iso_week, currentWeek);
  const cards = listQuery.data ?? [];

  // Composer entry points read the board itself, never the unfiltered project list: the two are
  // scoped differently, and subtracting a filtered set from an unfiltered one let a project the
  // filter had hidden — already reported — become the preset. `cards` carries both facts.
  const reportableCards = cards.filter((c) => c.can_report);
  const composableOptions = useMemo(
    () =>
      cards
        .filter((c) => c.can_report && !c.reported_by_me)
        .map((c) => ({ value: c.project_id, label: c.project_name })),
    [cards],
  );
  const boardLoaded = listQuery.data !== undefined;
  const nothingToReport = boardLoaded && !cannotReport && reportableCards.length === 0;
  const allReported = boardLoaded && reportableCards.length > 0 && composableOptions.length === 0;

  const filteredCard = search.project
    ? cards.find((c) => c.project_id === search.project)
    : undefined;
  const viewProjectId = filteredCard?.reported_by_me ? filteredCard.project_id : null;
  const composeDisabled =
    viewProjectId === null &&
    (listQuery.isError || cannotReport || nothingToReport || allReported || weekClosed);
  const composeDisabledReason = listQuery.isError
    ? 'This week’s board could not be loaded, so there is nothing to report on yet — try again first.'
    : cannotReport
      ? 'Only a project’s EM or PMO can write its weekly report, and you are neither on any project.'
      : allReported
        ? 'You have already written this week’s report for every project shown here.'
        : nothingToReport
          ? 'None of the projects shown here are yours to report on — clear the filters to reach the ones that are.'
          : notCurrentWeek
            ? 'Weekly reports can only be created for the current week.'
            : `${isoWeekBase(iso_year, iso_week)} closed at Friday 5:00 PM (Asia/Ho_Chi_Minh). Reporting reopens on Monday for the new week.`;

  // Portfolio rollup for the strip: how many projects sit at each overall colour this week.
  const summary = useMemo(() => {
    const c: Record<ColourKey, number> = { green: 0, yellow: 0, red: 0, gray: 0, none: 0 };
    for (const card of cards) c[colourKey(card.overall_colour)] += 1;
    return c;
  }, [cards]);
  const summaryTiles = SUMMARY_ORDER.filter(
    (k) => (k !== 'gray' && k !== 'none') || summary[k] > 0,
  );

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(cards.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageCards = useMemo(
    () => cards.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [cards, currentPage, pageSize],
  );

  const openComposer = () => {
    // Straight into the composer — the filtered project when manageable, else the first
    // manageable one; the PROJECT dropdown at the top of the form keeps the context explicit.
    const preset =
      composableOptions.find((o) => o.value === search.project) ?? composableOptions[0];
    if (preset) setComposeProject({ id: preset.value });
  };

  const closeDetail = () => {
    setComposeProject(null);
    if (detailParam) setSearch({ detail: undefined });
  };

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={1}>
            <Breadcrumbs variant="supporting">
              <BreadcrumbItem href="/pm">Project Monitoring</BreadcrumbItem>
              <BreadcrumbItem isCurrent>Weekly Reports</BreadcrumbItem>
            </Breadcrumbs>
            <HStack hAlign="between" vAlign="center" gap={2}>
              <Text as="h1" size="lg" weight="semibold">
                Weekly Reports
              </Text>
              <DisabledActionTooltip disabled={composeDisabled} reason={composeDisabledReason}>
                <Button
                  variant="primary"
                  label={viewProjectId ? 'View weekly report' : 'New weekly report'}
                  icon={viewProjectId ? undefined : <Plus className="size-4" />}
                  isDisabled={composeDisabled}
                  onClick={
                    viewProjectId ? () => setSearch({ detail: viewProjectId }) : openComposer
                  }
                />
              </DisabledActionTooltip>
            </HStack>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
          <div className="space-y-4 p-6">
            <div className="flex shrink-0 flex-wrap items-end gap-3">
              <Selector
                label="Week"
                size="sm"
                width={200}
                options={weekOptions}
                value={`${iso_year}-${iso_week}`}
                onChange={(v) => {
                  const [y, w] = v.split('-').map(Number);
                  if (y === undefined || w === undefined) return;
                  setPage(1);
                  setSearch({ iso_year: y, iso_week: w });
                }}
              />
              <Selector
                label="Account"
                size="sm"
                width={208}
                options={accountOptions}
                value={search.account ?? ''}
                onChange={(v) => {
                  setPage(1);
                  setSearch({ account: v || undefined, project: undefined });
                }}
              />
              <Selector
                label="Project"
                size="sm"
                width={208}
                options={projectOptions}
                value={search.project ?? ''}
                onChange={(v) => {
                  setPage(1);
                  setSearch({ project: v || undefined });
                }}
              />
            </div>

            {/* Portfolio health at a glance for the selected week — the number a PMO/BoD wants
                first, before scanning individual cards. */}
            {!listQuery.isLoading && cards.length > 0 ? (
              <div className="flex flex-wrap items-stretch gap-3">
                {summaryTiles.map((key) => (
                  <Card key={key} padding={3} className="min-w-[128px] flex-1">
                    <span className="block text-3xl font-bold text-primary">{summary[key]}</span>
                    <span className="flex items-center gap-1.5">
                      <StatusDot
                        variant={COLOUR_VARIANT[key]}
                        label={COLOUR_LABEL[key]}
                        style={markStyle(key)}
                      />
                      <Text type="supporting" color="secondary">
                        {COLOUR_LABEL[key]}
                      </Text>
                    </span>
                  </Card>
                ))}
                <div className="flex min-w-[128px] flex-1 flex-col justify-center rounded-lg border border-dashed border-border px-3 py-3">
                  <span className="text-3xl font-bold text-primary">{cards.length}</span>
                  <Text type="supporting">projects · {weekLabel}</Text>
                </div>
              </div>
            ) : null}

            {listQuery.isLoading ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-48 w-full" />
              </div>
            ) : listQuery.isError ? (
              // A rejected board is not an empty one: `?iso_week=99` and a malformed `?account=`
              // both reach the API, and reading "No projects for this week" off a 400 sends
              // people hunting for missing data that was never missing.
              <EmptyState
                title="Couldn’t load this week’s board"
                description={
                  (listQuery.error as Error).message ||
                  'The request was rejected. Check the week and filters in the address bar, then try again.'
                }
                actions={
                  <Button
                    variant="secondary"
                    label="Try again"
                    onClick={() => void listQuery.refetch()}
                  />
                }
              />
            ) : cards.length === 0 ? (
              <EmptyState title="No projects for this week" />
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {pageCards.map((card) => {
                    const overall = card.overall_colour;
                    const { worst, measured_count, applied_count, red_count, yellow_count } =
                      card.stats;
                    const coverage =
                      measured_count > 0
                        ? `${measured_count}/${applied_count} metrics`
                        : card.team_size != null
                          ? `Staffed ${card.staffed}/${card.team_size}`
                          : null;
                    const reportsPart =
                      card.report_count > 0
                        ? `${card.report_count} report${card.report_count === 1 ? '' : 's'}`
                        : 'No reports';
                    return (
                      <ClickableCard
                        key={card.project_id}
                        label={`Open weekly report for ${card.project_name}`}
                        onClick={() => setSearch({ detail: card.project_id })}
                        padding={4}
                        className="flex h-full flex-col gap-3"
                      >
                        {/* Identity (account only) + the overall verdict as a RAG badge. */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Heading level={3} maxLines={1}>
                              {card.project_name}
                            </Heading>
                            <Text type="supporting" color="secondary" maxLines={1} display="block">
                              {card.account_name}
                            </Text>
                          </div>
                          <span className="shrink-0">{colourBadge(overall)}</span>
                        </div>

                        {/* QCDP pillars — full names with a small status dot each; colour stays a
                          mark, not a surface. An off-norm pillar weights its name. */}
                        <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                          {KPI_CATEGORIES.map((cat) => {
                            const colour = card.category_colours[cat];
                            const key = colourKey(colour);
                            const name =
                              KPI_CATEGORY_LABELS[cat].split(' — ')[1] ?? KPI_CATEGORY_LABELS[cat];
                            const off = colour !== null && colour !== 'green' && colour !== 'gray';
                            return (
                              <span
                                key={cat}
                                className="flex items-center gap-1.5"
                                title={`${KPI_CATEGORY_LABELS[cat]}: ${COLOUR_LABEL[key]}`}
                              >
                                <StatusDot
                                  variant={COLOUR_VARIANT[key]}
                                  label={`${KPI_CATEGORY_LABELS[cat]}: ${COLOUR_LABEL[key]}`}
                                  style={markStyle(key)}
                                />
                                <Text
                                  type="supporting"
                                  color={off ? 'primary' : 'secondary'}
                                  weight={off ? 'medium' : 'normal'}
                                >
                                  {name}
                                </Text>
                              </span>
                            );
                          })}
                        </div>

                        {worst ? (
                          <div className="flex gap-2.5">
                            <span
                              aria-hidden
                              className="w-[3px] shrink-0 rounded-full"
                              style={markStyle(worst.status)}
                            />
                            <div className="min-w-0">
                              <span className="flex min-w-0 items-baseline gap-1.5">
                                {worst.computed_value === null ? null : (
                                  <Text size="lg" weight="bold">
                                    {formatMetricValue(
                                      worst.computed_value,
                                      worst.name,
                                      worst.component_count,
                                    )}
                                  </Text>
                                )}
                                <Text
                                  type="label"
                                  weight="semibold"
                                  maxLines={1}
                                  className="min-w-0"
                                >
                                  {worst.name}
                                </Text>
                              </span>
                              <Text type="supporting" color="secondary" display="block">
                                {`norm ${formatBand(worst.name, worst.component_count, worst.green_band)}`}
                              </Text>
                            </div>
                          </div>
                        ) : (
                          <Text type="supporting" color="secondary" display="block">
                            {measured_count > 0 ? 'All on norm' : 'No figures this week'}
                          </Text>
                        )}

                        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3">
                          <span className="min-w-0">
                            {worst ? (
                              <Text type="supporting" color="secondary" maxLines={1}>
                                {`${red_count} red · ${yellow_count} amber`}
                              </Text>
                            ) : null}
                          </span>
                          <span className="shrink-0">
                            <Text type="supporting" color="secondary">
                              {coverage ? `${coverage} · ${reportsPart}` : reportsPart}
                            </Text>
                          </span>
                        </div>
                      </ClickableCard>
                    );
                  })}
                </div>
                <div className="flex justify-center">
                  <PaginationFooter
                    page={currentPage}
                    onChange={setPage}
                    totalItems={cards.length}
                    pageSize={pageSize}
                    pageSizeOptions={PAGE_SIZE_OPTIONS}
                    onPageSizeChange={(size) => {
                      setPageSize(size);
                      setPage(1);
                    }}
                    variant="compact"
                    size="sm"
                    label="Weekly report pages"
                  />
                </div>
              </>
            )}
          </div>

          {openProject ? (
            <WeeklyReportDetailDialog
              // Keyed by project so switching in the composer's PROJECT dropdown remounts the
              // dialog with fresh form state prefilled from the new project.
              key={openProject.id ?? 'pick-project'}
              project_id={openProject.id}
              startInCompose={composeProject !== null}
              iso_year={iso_year}
              iso_week={iso_week}
              projectOptions={composeProject !== null ? composableOptions : undefined}
              onProjectChange={(id) => setComposeProject({ id })}
              onOpenChange={(open) => {
                if (!open) closeDetail();
              }}
            />
          ) : null}
        </LayoutContent>
      }
    />
  );
}
