import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectDetailPage } from '../../../src/pages/project-detail-page.tsx';

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ projectId: 'proj-1' }),
  Link: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));

vi.mock('@seta/web-identity', () => ({
  usePermission: () => true,
}));

const project = {
  project_id: 'proj-1',
  account_id: 'acc-1',
  name: 'Atlas',
  phase: 'execution',
  status: 'active' as const,
  pm_worker_id: null,
  charter_id: null,
  objective: null,
  scope: null,
  budget_bmm: null,
  pmo_worker_id: null,
  team_size: null,
  methodology: null,
  pricing_model: null,
  date_from: null,
  date_to: null,
  planner_group_id: null,
  org_unit_id: 'ou-1',
  version: 3,
};

const orgUnits = [
  { org_unit_id: 'ou-1', name: 'Engineering', parent_id: null },
  { org_unit_id: 'ou-2', name: 'Sales', parent_id: null },
];

const editProjectMock = vi.fn(async () => ({ version: 4 }));

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function mockFetch() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/staffing-plan')) return jsonResponse({ lines: [] });
      if (url.includes('/api/people/v1/workers')) return jsonResponse({ rows: [] });
      if (url.includes('/access')) return jsonResponse({ access: [] });
      if (url.includes('/planner/v1/groups')) return jsonResponse({ groups: [] });
      if (url.includes('/identity/v1/org-units')) return jsonResponse({ org_units: orgUnits });
      if (url.includes('/api/pm/v1/projects/proj-1') && init?.method === 'PATCH') {
        const patchBody = JSON.parse(String(init.body));
        const { version } = await editProjectMock(patchBody);
        return jsonResponse({ version });
      }
      if (url.includes('/api/pm/v1/projects/proj-1')) return jsonResponse(project);
      throw new Error(`unexpected fetch: ${url} ${init?.method ?? 'GET'}`);
    },
  );
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProjectDetailPage />
    </QueryClientProvider>,
  );
}

describe('ProjectDetailPage org unit field', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    editProjectMock.mockClear();
  });

  it('renders the current org unit label', async () => {
    mockFetch();
    renderPage();
    expect(await screen.findByText('Engineering')).toBeInTheDocument();
  });

  it('includes org_unit_id in the patch payload when changed', async () => {
    mockFetch();
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText('Engineering'));
    await user.click(await screen.findByText('Sales'));

    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(editProjectMock).toHaveBeenCalled());
    const body = editProjectMock.mock.calls.at(-1)?.[0] as { patch: { org_unit_id?: string } };
    expect(body.patch.org_unit_id).toBe('ou-2');
  });
});
