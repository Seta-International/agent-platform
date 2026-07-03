import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkSection } from '../../../src/users/components/WorkSection.tsx';

const permissions: Record<string, boolean> = {
  'people.worker.update': true,
  'pm.project.manage': true,
};
vi.mock('@seta/web-identity', () => ({
  usePermission: (key: string) => permissions[key] ?? false,
}));

vi.mock('../../../src/users/api/work-client.ts', () => ({
  getWorkerProfile: async () => ({
    worker_id: 'w1',
    job_title: 'Backend Dev',
    org_unit_id: 'ou1',
    org_unit_name: 'Engineering',
    version: 3,
    lifecycle_stage: 'active',
    accounts: [{ id: 'acc1', name: 'ACME' }],
    projects: [{ id: 'p1', name: 'Web Platform' }],
  }),
  listWorkerAllocations: async () => [
    {
      allocation_id: 'al1',
      project_id: 'p1',
      project_name: 'Web Platform',
      account_id: 'acc1',
      account_name: 'ACME',
      role: 'dev',
      planned_pct: 50,
      status: 'committed',
    },
  ],
  listOrgUnits: async () => [{ id: 'ou1', name: 'Engineering' }],
  listWorkersBrief: async () => [],
  searchAccounts: async () => [],
  searchProjects: async () => [],
  patchWorker: async () => ({ worker_id: 'w1', version: 4 }),
  createWorkerAllocation: async () => ({ allocation_id: 'al2' }),
  deleteWorkerAllocation: async () => undefined,
}));

function renderSection(status: 'active' | 'terminated' = 'active') {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <WorkSection workerId="w1" employmentStatus={status} />
    </QueryClientProvider>,
  );
}

describe('WorkSection', () => {
  it('renders position, department, allocation rows and account chips', async () => {
    renderSection();
    expect(await screen.findByDisplayValue('Backend Dev')).toBeInTheDocument();
    expect(await screen.findByText('Engineering')).toBeInTheDocument();
    expect(await screen.findByText('Web Platform')).toBeInTheDocument();
    expect(await screen.findByText('ACME')).toBeInTheDocument();
  });

  it('hides project editing without pm.project.manage', async () => {
    permissions['pm.project.manage'] = false;
    renderSection();
    await screen.findByText('Web Platform');
    expect(screen.queryByRole('button', { name: /add project/i })).not.toBeInTheDocument();
    permissions['pm.project.manage'] = true;
  });

  it('locks editing for terminated workers', async () => {
    renderSection('terminated');
    const input = await screen.findByDisplayValue('Backend Dev');
    expect(input).toBeDisabled();
  });
});
