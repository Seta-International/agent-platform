import {
  Badge,
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
  Pagination,
  Selector,
  Skeleton,
  StatusDot,
  Text,
  VStack,
} from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import {
  fetchAccounts,
  fetchProjects,
  fetchWeeklyReports,
  type ReportColour,
} from '../api/pm-client.ts';
import { pmKeys } from '../state/query-keys.ts';
import {
  formatBand,
  formatMetricValue,
  KPI_CATEGORIES,
  KPI_CATEGORY_LABELS,
} from './kpi-shared.tsx';
import { COMING_SOON_REASON, WEEKLY_REPORT_COMPOSER_COMING_SOON } from './pm-coming-soon.tsx';
import { usePmContext } from './use-pm-context.ts';
import { WeeklyReportDetailDialog } from './weekly-report-detail-dialog.tsx';

export interface WeeklyReportsSearch {
  account?: string;
  project?: string;
  iso_year?: number;
  iso_week?: number;
  detail?: string;
}

// RAG colour → Astryx status variant (shared by StatusDot and Badge; chromatic = status only).
type ColourKey = ReportColour | 'none';
const colourKey = (colour: ReportColour | null): ColourKey => colour ?? 'none';

const COLOUR_VARIANT: Record<ColourKey, 'success' | 'warning' | 'error' | 'neutral'> = {
  green: 'success',
  yellow: 'warning',
  red: 'error',
  gray: 'neutral',
  none: 'neutral',
};
// RAG wording: the stored value stays 'yellow' (API contract), the user reads "Amber".
const COLOUR_LABEL: Record<ColourKey, string> = {
  green: 'Green',
  yellow: 'Amber',
  red: 'Red',
  gray: 'No data',
  none: 'Not assessed',
};
const RAG_MARK_TOKEN: Record<ColourKey, { fill: string; on: string } | null> = {
  green: { fill: 'var(--rag-green)', on: 'var(--rag-on-green)' },
  yellow: { fill: 'var(--rag-amber)', on: 'var(--rag-on-amber)' },
  red: { fill: 'var(--rag-red)', on: 'var(--rag-on-red)' },
  gray: null,
  none: null,
};
const markStyle = (key: ColourKey) => {
  const token = RAG_MARK_TOKEN[key];
  return token ? { backgroundColor: token.fill } : undefined;
};
const badgeStyle = (key: ColourKey) => {
  const token = RAG_MARK_TOKEN[key];
  return token ? { backgroundColor: token.fill, color: token.on } : undefined;
};
// Colour budget: status colour appears only as small marks (dots, one verdict badge per card).
// Large chromatic surfaces made the board shout — Green is the norm and must stay quiet.

// The portfolio-health strip: one tile per outcome, always Green/Amber/Red; "No data" only
// when a project has no measured entries this week (so it never adds noise on a full board).
const SUMMARY_ORDER: ColourKey[] = ['green', 'yellow', 'red', 'gray', 'none'];

const PAGE_SIZE = 12;

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
  // Reports are only ever authored for the current week (weeks[0] is the server anchor);
  // browsing a past week is read-only, so composing is disabled with a reason.
  const currentWeek = weeks[0];
  const isPastWeek =
    currentWeek !== undefined &&
    (currentWeek.iso_year !== iso_year || currentWeek.iso_week !== iso_week);
  const composeDisabled = WEEKLY_REPORT_COMPOSER_COMING_SOON || cannotReport || isPastWeek;
  const composeDisabledReason = WEEKLY_REPORT_COMPOSER_COMING_SOON
    ? COMING_SOON_REASON
    : cannotReport
      ? 'Only a project’s EM or PMO can write its weekly report, and you are neither on any project.'
      : 'Weekly reports can only be created for the current week.';

  const cards = listQuery.data ?? [];

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
  const totalPages = Math.max(1, Math.ceil(cards.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageCards = useMemo(
    () => cards.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [cards, currentPage],
  );
  const boardRef = useRef<HTMLDivElement>(null);
  const goToPage = (next: number) => {
    setPage(next);
    boardRef.current?.scrollIntoView?.({ block: 'start' });
  };

  const openComposer = () => {
    // Straight into the composer — the filtered project when manageable, else the first
    // manageable one; the PROJECT dropdown at the top of the form keeps the context explicit.
    const preset =
      manageableOptions.find((o) => o.value === search.project) ?? manageableOptions[0];
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
          <VStack gap={3}>
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
                    label="New weekly report"
                    icon={<Plus className="size-4" />}
                    isDisabled={composeDisabled}
                    onClick={openComposer}
                  />
                </DisabledActionTooltip>
              </HStack>
            </VStack>
            {/* Context filters sit in the header band itself (always visible, no detached grey
                strip). Labels are a11y-only (web-planner filter-bar convention) — the trigger
                text is self-describing. Week leads — it's the primary axis. */}
            <div className="flex flex-wrap items-center gap-2">
              <Selector
                label="Week"
                isLabelHidden
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
                isLabelHidden
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
                isLabelHidden
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
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
          <div ref={boardRef} className="space-y-4 p-6">
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
                          <span className="shrink-0">
                            <Badge
                              variant={COLOUR_VARIANT[colourKey(overall)]}
                              label={COLOUR_LABEL[colourKey(overall)]}
                              style={badgeStyle(colourKey(overall))}
                            />
                          </span>
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
                  <Pagination
                    page={currentPage}
                    onChange={goToPage}
                    totalItems={cards.length}
                    pageSize={PAGE_SIZE}
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
              projectOptions={composeProject !== null ? manageableOptions : undefined}
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
