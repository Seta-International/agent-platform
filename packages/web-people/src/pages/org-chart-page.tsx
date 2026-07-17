import {
  BreadcrumbItem,
  Breadcrumbs,
  createStaticSource,
  HStack,
  Layout,
  LayoutContent,
  LayoutHeader,
  type SearchableItem,
  SegmentedControl,
  SegmentedControlItem,
  Text,
  Typeahead,
  VStack,
} from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';
import { fetchOrgCompany, fetchOrgDelivery, fetchOrgStructure } from '../api/org-client.ts';
import { buildAccountGraph } from '../components/org-chart/build-account-graph.ts';
import { buildCompanyGraph } from '../components/org-chart/build-company-graph.ts';
import { buildDepartmentGraph } from '../components/org-chart/build-department-graph.ts';
import { buildProjectGraph } from '../components/org-chart/build-project-graph.ts';
import type { OrgGraphNodeData } from '../components/org-chart/graph-layout.ts';
import { OrgChartCanvas } from '../components/org-chart/org-chart-canvas.tsx';
import { peopleKeys } from '../state/query-keys.ts';

export type OrgView = 'company' | 'account' | 'project' | 'department';

export interface OrgSearch {
  view: OrgView;
  account?: string;
  project?: string;
  department?: string;
}

export function OrgChartPage() {
  const navigate = useNavigate();
  const raw = useSearch({ strict: false }) as Partial<OrgSearch>;
  const view: OrgView = raw.view ?? 'company';
  const account = raw.account;
  const project = raw.project;
  const department = raw.department;

  // All view + selection state lives in the URL, so refresh / back / share restore the exact node.
  const setSearch = (patch: Partial<OrgSearch>): void => {
    void navigate({
      to: '/people/org',
      search: { view, account, project, department, ...patch },
      replace: true,
    });
  };

  const companyQ = useQuery({
    queryKey: peopleKeys.orgCompany(),
    queryFn: fetchOrgCompany,
    enabled: view === 'company',
  });
  const deliveryQ = useQuery({
    queryKey: peopleKeys.orgDelivery(),
    queryFn: fetchOrgDelivery,
    enabled: view === 'account' || view === 'project',
  });
  const structureQ = useQuery({
    queryKey: peopleKeys.orgStructure(),
    queryFn: fetchOrgStructure,
    enabled: view === 'department',
  });

  const accounts = useMemo(() => deliveryQ.data?.accounts ?? [], [deliveryQ.data]);
  const units = useMemo(() => structureQ.data?.units ?? [], [structureQ.data]);

  const accountItems = useMemo<SearchableItem[]>(
    () => accounts.map((a) => ({ id: a.account_id, label: a.name })),
    [accounts],
  );
  const accountSource = useMemo(() => createStaticSource(accountItems), [accountItems]);
  const accountValue = accountItems.find((a) => a.id === account) ?? null;

  const projectItems = useMemo<SearchableItem[]>(
    () =>
      accounts.flatMap((a) =>
        a.projects.map((p) => ({ id: p.project_id, label: `${p.name} · ${a.name}` })),
      ),
    [accounts],
  );
  const projectSource = useMemo(() => createStaticSource(projectItems), [projectItems]);
  const projectValue = projectItems.find((p) => p.id === project) ?? null;

  const departmentItems = useMemo<SearchableItem[]>(
    () => units.map((u) => ({ id: u.id, label: u.name })),
    [units],
  );
  const departmentSource = useMemo(() => createStaticSource(departmentItems), [departmentItems]);
  const departmentValue = departmentItems.find((d) => d.id === department) ?? null;

  // Default the picker to the first option once data arrives, persisting it to the URL.
  useEffect(() => {
    if (view === 'account' && !account && accountItems.length > 0) {
      void navigate({
        to: '/people/org',
        search: { view, project, department, account: accountItems[0]?.id },
        replace: true,
      });
    }
    if (view === 'project' && !project && projectItems.length > 0) {
      void navigate({
        to: '/people/org',
        search: { view, account, department, project: projectItems[0]?.id },
        replace: true,
      });
    }
    if (view === 'department' && !department && departmentItems.length > 0) {
      void navigate({
        to: '/people/org',
        search: { view, account, project, department: departmentItems[0]?.id },
        replace: true,
      });
    }
  }, [view, account, project, department, accountItems, projectItems, departmentItems, navigate]);

  const graph = useMemo(() => {
    if (view === 'company') return buildCompanyGraph(companyQ.data?.nodes ?? []);
    if (view === 'account') return buildAccountGraph(accounts, account ?? null);
    if (view === 'department') return buildDepartmentGraph(units, department ?? null);
    return buildProjectGraph(accounts, project ?? null);
  }, [view, companyQ.data, accounts, account, project, units, department]);

  const onNodeClick = (data: OrgGraphNodeData): void => {
    if (data.personId) {
      void navigate({ to: '/people/employees/$workerId', params: { workerId: data.personId } });
      return;
    }
    if (data.nav?.view === 'account') {
      setSearch({ view: 'account', account: data.nav.accountId ?? account });
      return;
    }
    if (data.nav?.view === 'project') {
      setSearch({
        view: 'project',
        project: data.nav.projectId,
        account: data.nav.accountId ?? account,
      });
      return;
    }
    if (data.nav?.view === 'department') {
      setSearch({ view: 'department', department: data.nav.deptId });
    }
  };

  const isLoading =
    view === 'company'
      ? companyQ.isLoading
      : view === 'department'
        ? structureQ.isLoading
        : deliveryQ.isLoading;
  const isEmpty = graph.nodes.length === 0;

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={1}>
            <Breadcrumbs variant="supporting">
              <BreadcrumbItem href="/people">People</BreadcrumbItem>
              <BreadcrumbItem isCurrent>Org Chart</BreadcrumbItem>
            </Breadcrumbs>
            <HStack hAlign="between" vAlign="center" gap={2}>
              <HStack gap={2} vAlign="center">
                <Text as="h1" size="lg" weight="semibold">
                  Org Chart
                </Text>
              </HStack>
            </HStack>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
          <div className="flex h-[calc(100vh-9rem)] flex-col gap-3 p-4">
            <div className="flex items-center gap-3">
              <SegmentedControl
                label="Org chart view"
                value={view}
                onChange={(v) => setSearch({ view: v as OrgView })}
              >
                <SegmentedControlItem value="company" label="Company" />
                <SegmentedControlItem value="department" label="Department" />
                <SegmentedControlItem value="account" label="Account" />
                <SegmentedControlItem value="project" label="Project" />
              </SegmentedControl>
              {view === 'account' ? (
                <div className="w-64">
                  <Typeahead
                    label="Account"
                    isLabelHidden
                    searchSource={accountSource}
                    debounceMs={0}
                    hasEntriesOnFocus
                    value={accountValue}
                    onChange={(item) => setSearch({ account: item?.id ?? undefined })}
                    placeholder="Select account…"
                  />
                </div>
              ) : null}
              {view === 'project' ? (
                <div className="w-72">
                  <Typeahead
                    label="Project"
                    isLabelHidden
                    searchSource={projectSource}
                    debounceMs={0}
                    hasEntriesOnFocus
                    value={projectValue}
                    onChange={(item) => setSearch({ project: item?.id ?? undefined })}
                    placeholder="Select project…"
                  />
                </div>
              ) : null}
              {view === 'department' ? (
                <div className="w-64">
                  <Typeahead
                    label="Department"
                    isLabelHidden
                    searchSource={departmentSource}
                    debounceMs={0}
                    hasEntriesOnFocus
                    value={departmentValue}
                    onChange={(item) => setSearch({ department: item?.id ?? undefined })}
                    placeholder="Select department…"
                  />
                </div>
              ) : null}
              <ChartLegend />
            </div>
            <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border">
              {isLoading ? (
                <div className="grid h-full place-items-center text-caption text-secondary">
                  Loading…
                </div>
              ) : isEmpty ? (
                <div className="grid h-full place-items-center text-caption text-secondary">
                  Nothing to show in your scope.
                </div>
              ) : (
                <OrgChartCanvas nodes={graph.nodes} edges={graph.edges} onNodeClick={onNodeClick} />
              )}
            </div>
          </div>
        </LayoutContent>
      }
    />
  );
}

const LEGEND: Array<{ label: string; accent: string }> = [
  { label: 'Department', accent: 'var(--color-text-secondary)' },
  { label: 'Account', accent: 'var(--color-icon-teal)' },
  { label: 'Project', accent: 'var(--color-warning)' },
  { label: 'Person', accent: 'var(--color-accent)' },
];

function ChartLegend() {
  return (
    <div className="ml-auto flex items-center gap-3">
      {LEGEND.map((l) => (
        <span key={l.label} className="flex items-center gap-1.5 text-caption text-secondary">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: l.accent }} />
          {l.label}
        </span>
      ))}
    </div>
  );
}
