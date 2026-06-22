import { Combobox, PageChrome, SegmentedControl } from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { fetchOrgCompany, fetchOrgDelivery } from '../api/org-client.ts';
import { buildAccountGraph } from '../components/org-chart/build-account-graph.ts';
import { buildCompanyGraph } from '../components/org-chart/build-company-graph.ts';
import { buildProjectGraph } from '../components/org-chart/build-project-graph.ts';
import type { OrgGraphNodeData } from '../components/org-chart/graph-layout.ts';
import { OrgChartCanvas } from '../components/org-chart/org-chart-canvas.tsx';
import { peopleKeys } from '../state/query-keys.ts';

type Tab = 'company' | 'account' | 'project';

export function OrgChartPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('company');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);

  const companyQ = useQuery({
    queryKey: peopleKeys.orgCompany(),
    queryFn: fetchOrgCompany,
    enabled: tab === 'company',
  });
  const deliveryQ = useQuery({
    queryKey: peopleKeys.orgDelivery(),
    queryFn: fetchOrgDelivery,
    enabled: tab === 'account' || tab === 'project',
  });

  const accounts = useMemo(() => deliveryQ.data?.accounts ?? [], [deliveryQ.data]);
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

  // Default the picker to the first option once data arrives.
  useEffect(() => {
    if (tab === 'account' && accountId === null && accountOptions.length > 0) {
      setAccountId(accountOptions[0]!.value);
    }
    if (tab === 'project' && projectId === null && projectOptions.length > 0) {
      setProjectId(projectOptions[0]!.value);
    }
  }, [tab, accountId, projectId, accountOptions, projectOptions]);

  const graph = useMemo(() => {
    if (tab === 'company') return buildCompanyGraph(companyQ.data?.nodes ?? []);
    if (tab === 'account') return buildAccountGraph(accounts, accountId);
    return buildProjectGraph(accounts, projectId);
  }, [tab, companyQ.data, accounts, accountId, projectId]);

  const onNodeClick = (data: OrgGraphNodeData): void => {
    if (data.personId) {
      void navigate({ to: '/people/employees/$workerId', params: { workerId: data.personId } });
      return;
    }
    if (tab === 'company' && data.accountId) {
      setAccountId(data.accountId);
      setTab('account');
    }
  };

  const isLoading = tab === 'company' ? companyQ.isLoading : deliveryQ.isLoading;
  const isEmpty = graph.nodes.length === 0;

  return (
    <PageChrome title="Org Chart">
      <div className="flex h-[calc(100vh-9rem)] flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <SegmentedControl
            aria-label="Org chart view"
            value={tab}
            onValueChange={(v) => setTab(v as Tab)}
            options={[
              { value: 'company', label: 'Company' },
              { value: 'account', label: 'Account' },
              { value: 'project', label: 'Project' },
            ]}
          />
          {tab === 'account' ? (
            <div className="w-64">
              <Combobox
                options={accountOptions}
                value={accountId}
                onChange={setAccountId}
                placeholder="Select account…"
              />
            </div>
          ) : null}
          {tab === 'project' ? (
            <div className="w-72">
              <Combobox
                options={projectOptions}
                value={projectId}
                onChange={setProjectId}
                placeholder="Select project…"
              />
            </div>
          ) : null}
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
