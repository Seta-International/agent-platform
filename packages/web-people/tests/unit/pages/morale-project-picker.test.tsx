import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MoralePage } from '../../../src/pages/morale-page.tsx';

// The page links to the history route; the router itself is irrelevant here.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

const PROJECTS = [
  { project_id: 'proj-alpha', name: 'Alpha' },
  { project_id: 'proj-beta', name: 'Beta' },
];

/** PMO is granted at tenant scope, so the same group comes back for every project. */
const PMO_GROUP = {
  tag: 'pmo',
  candidates: [{ person_id: 'pmo-1', full_name: 'Pat Ellis', context: null }],
  unavailable_reason: null,
};

function tlGroup(name: string, personId: string, projectName: string) {
  return {
    tag: 'tl',
    candidates: [{ person_id: personId, full_name: name, context: projectName }],
    unavailable_reason: null,
  };
}

const mockSubmit = vi.fn().mockResolvedValue({ note_id: 'n-1' });

/**
 * Stands in for the server's own scoping rule: TL comes from the requested project, and
 * with nothing requested there is no TL to give — the picker has to be answered first.
 */
const mockFetch = vi.fn(async (projectId?: string | null) => {
  if (projectId === 'proj-alpha') {
    return {
      can_submit: true,
      projects: PROJECTS,
      selected_project_id: 'proj-alpha',
      groups: [PMO_GROUP, tlGroup('Lead Alpha', 'lead-a', 'Alpha')],
    };
  }
  if (projectId === 'proj-beta') {
    return {
      can_submit: true,
      projects: PROJECTS,
      selected_project_id: 'proj-beta',
      groups: [PMO_GROUP, tlGroup('Lead Beta', 'lead-b', 'Beta')],
    };
  }
  return { can_submit: true, projects: PROJECTS, selected_project_id: null, groups: [PMO_GROUP] };
});

vi.mock('../../../src/api/people-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/api/people-client.ts')>()),
  fetchMoraleRecipients: (projectId?: string | null) => mockFetch(projectId),
  submitMorale: (...args: unknown[]) => mockSubmit(...args),
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MoralePage />
    </QueryClientProvider>,
  );
}

/** Opens the project dropdown and picks `name`. */
async function chooseProject(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name: /Project/ }));
  await user.click(await screen.findByRole('option', { name }));
}

describe('Morale project picker for a sender on several projects', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    mockSubmit.mockClear();
  });

  it('blocks Submit and withholds the Team Leader until a project is chosen', async () => {
    renderPage();

    // PMO is answerable without a project, so its group is on screen from the start —
    // which is exactly why the block below has to be explained rather than just applied.
    expect(await screen.findByRole('checkbox', { name: 'PMO' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Team Leader' })).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Neutral' }));

    // A rating alone would normally be enough; the missing project is the only thing
    // holding Submit, and the hint says so instead of leaving it silently greyed out.
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    expect(
      screen.getByText('Choose a project above to see your Team Leader and Account Manager.'),
    ).toBeInTheDocument();
  });

  it('reloads the Team Leader for the chosen project and submits that project', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('checkbox', { name: 'PMO' });
    await chooseProject(user, 'Alpha');

    const teamLead = await screen.findByRole('checkbox', { name: 'Team Leader' });
    await user.click(teamLead);
    await user.click(screen.getByText('Select recipients...'));
    expect(await screen.findByRole('option', { name: /Lead Alpha/ })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: /Lead Alpha/ }));

    await user.click(screen.getByRole('button', { name: 'Neutral' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() =>
      expect(mockSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ project_id: 'proj-alpha', recipient_person_ids: ['lead-a'] }),
      ),
    );
  });

  it('clears picks made under the previous project when the project changes', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('checkbox', { name: 'PMO' });
    await chooseProject(user, 'Alpha');

    // Tick PMO — a group that survives the switch — so the assertion below is about the
    // selection being dropped, not about the group disappearing with its project.
    await user.click(await screen.findByRole('checkbox', { name: 'PMO' }));
    expect(screen.getByRole('checkbox', { name: 'PMO' })).toBeChecked();

    await chooseProject(user, 'Beta');

    // Alpha's lead must not survive into a Beta note, and neither may a PMO pick staged
    // against a list the sender has since replaced.
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'PMO' })).not.toBeChecked());
    await user.click(await screen.findByRole('checkbox', { name: 'Team Leader' }));
    await user.click(screen.getByText('Select recipients...'));
    expect(await screen.findByRole('option', { name: /Lead Beta/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Lead Alpha/ })).not.toBeInTheDocument();
  });
});
