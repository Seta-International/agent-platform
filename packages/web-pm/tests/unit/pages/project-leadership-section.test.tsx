import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectLeadershipSection } from '../../../src/pages/project-leadership-section.tsx';

vi.mock('../../../src/api/worker-search.ts', () => ({
  useWorkerSource: () => ({
    source: { search: () => Promise.resolve([]), bootstrap: () => Promise.resolve([]) },
    seed: (ids: string[]) =>
      Promise.resolve(
        ids.map((id) => ({ id, label: id === 'em-1' ? 'Lê Huỳnh Nam' : 'Trần Thị B' })),
      ),
  }),
}));

const editProjectMock = vi.fn(async () => ({ version: 5 }));
vi.mock('../../../src/api/pm-client.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/pm-client.ts')>();
  return {
    ...actual,
    editProject: (id: string, input: unknown) => editProjectMock(id, input),
  };
});

function renderSection(props: Partial<React.ComponentProps<typeof ProjectLeadershipSection>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProjectLeadershipSection
        projectId="proj-1"
        version={3}
        pmWorkerId={null}
        pmoWorkerId={null}
        canManage
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe('ProjectLeadershipSection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    editProjectMock.mockClear();
  });

  it('shows resolved names for an assigned EM/PMO, with Remove but no reassign control', async () => {
    renderSection({ pmWorkerId: 'em-1', pmoWorkerId: 'pmo-1' });

    expect(await screen.findByText('Lê Huỳnh Nam')).toBeInTheDocument();
    expect(await screen.findByText('Trần Thị B')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
  });

  it('shows an Add control for an empty slot, disabled until a worker is picked', async () => {
    renderSection({ pmWorkerId: null, pmoWorkerId: 'pmo-1' });

    await screen.findByText('Trần Thị B');
    const addButtons = screen.getAllByRole('button', { name: 'Add' });
    expect(addButtons).toHaveLength(1);
    expect(addButtons[0]).toBeDisabled();
  });

  it('removing EM patches pm_worker_id to null against the current version', async () => {
    const user = userEvent.setup();
    renderSection({ pmWorkerId: 'em-1', pmoWorkerId: null, version: 7 });

    await user.click(await screen.findByRole('button', { name: 'Remove' }));

    expect(editProjectMock).toHaveBeenCalledWith('proj-1', {
      expected_version: 7,
      patch: { pm_worker_id: null },
    });
  });

  it('read-only mode shows Unassigned text and no action buttons', () => {
    renderSection({ canManage: false, pmWorkerId: null, pmoWorkerId: null });

    expect(screen.getAllByText('Unassigned')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
  });
});
