import { Combobox, PageChrome, SegmentedControl } from '@seta/shared-ui';
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

  const accountOptions = useMemo(
    () => accounts.map((a) => ({ value: a.account_id, label: a.name })),
    [accounts],
  );
  const projectOptions = useMemo(
    () =>
      accounts.flatMap((a) =>
        a.projects.map((p) => ({ value: p.project_id, label: `${p.name} · ${a.name}` })),
      ),
    [accounts],
  );
  const departmentOptions = useMemo(
    () => units.map((u) => ({ value: u.id, label: u.name })),
    [units],
  );

  // Default the picker to the first option once data arrives, persisting it to the URL.
  useEffect(() => {
    if (view === 'account' && !account && accountOptions.length > 0) {
      void navigate({
        to: '/people/org',
        search: { view, project, department, account: accountOptions[0]?.value },
        replace: true,
      });
    }
    if (view === 'project' && !project && projectOptions.length > 0) {
      void navigate({
        to: '/people/org',
        search: { view, account, department, project: projectOptions[0]?.value },
        replace: true,
      });
    }
    if (view === 'department' && !department && departmentOptions.length > 0) {
      void navigate({
        to: '/people/org',
        search: { view, account, project, department: departmentOptions[0]?.value },
        replace: true,
      });
    }
  }, [
    view,
    account,
    project,
    department,
    accountOptions,
    projectOptions,
    departmentOptions,
    navigate,
  ]);

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
    <PageChrome title="Org Chart">
      <div className="flex h-[calc(100vh-9rem)] flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <SegmentedControl
            aria-label="Org chart view"
            value={view}
            onValueChange={(v) => setSearch({ view: v as OrgView })}
            options={[
              { value: 'company', label: 'Company' },
              { value: 'department', label: 'Department' },
              { value: 'account', label: 'Account' },
              { value: 'project', label: 'Project' },
            ]}
          />
          {view === 'account' ? (
            <div className="w-64">
              <Combobox
                options={accountOptions}
                value={account ?? null}
                onChange={(v) => setSearch({ account: v ?? undefined })}
                placeholder="Select account…"
              />
            </div>
          ) : null}
          {view === 'project' ? (
            <div className="w-72">
              <Combobox
                options={projectOptions}
                value={project ?? null}
                onChange={(v) => setSearch({ project: v ?? undefined })}
                placeholder="Select project…"
              />
            </div>
          ) : null}
          {view === 'department' ? (
            <div className="w-64">
              <Combobox
                options={departmentOptions}
                value={department ?? null}
                onChange={(v) => setSearch({ department: v ?? undefined })}
                placeholder="Select department…"
              />
            </div>
          ) : null}
          <ChartLegend />
        </div>
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-hairline">
          {isLoading ? (
            <div className="grid h-full place-items-center text-caption text-ink-subtle">
              Loading…
            </div>
          ) : isEmpty ? (
            <div className="grid h-full place-items-center text-caption text-ink-subtle">
              Nothing to show in your scope.
            </div>
          ) : (
            <OrgChartCanvas nodes={graph.nodes} edges={graph.edges} onNodeClick={onNodeClick} />
          )}
        </div>
      </div>
    </PageChrome>
  );
}

const LEGEND: Array<{ label: string; accent: string }> = [
  { label: 'Department', accent: 'var(--color-ink-subtle)' },
  { label: 'Account', accent: 'var(--color-group-theme-teal)' },
  { label: 'Project', accent: 'var(--color-warning)' },
  { label: 'Person', accent: 'var(--color-primary)' },
];

function ChartLegend() {
  return (
    <div className="ml-auto flex items-center gap-3">
      {LEGEND.map((l) => (
        <span key={l.label} className="flex items-center gap-1.5 text-caption text-ink-subtle">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: l.accent }} />
          {l.label}
        </span>
      ))}
    </div>
  );
}
