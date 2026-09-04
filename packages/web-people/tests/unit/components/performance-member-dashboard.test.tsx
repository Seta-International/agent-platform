import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EvaluationView, PerformanceRollup } from '../../../src/api/people-client.ts';

vi.mock('../../../src/api/people-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/api/people-client.ts')>()),
  fetchPerformanceRollup: vi.fn(),
  fetchEvaluation: vi.fn(),
  saveEvaluationDraft: vi.fn(),
  submitEvaluation: vi.fn(),
}));

import { fetchEvaluation, fetchPerformanceRollup } from '../../../src/api/people-client.ts';
import { PerformanceMemberDashboard } from '../../../src/components/performance-member-dashboard.tsx';

const ME = '11111111-1111-4111-8111-111111111111';
const PROJECT = '22222222-2222-4222-8222-222222222222';
const DELIVERY = '66666666-6666-4666-8666-666666666666';
const CRITERION = '33333333-3333-4333-8333-333333333333';

/** The member's own roll-up: one project, one review from their lead. */
function rollup(over: Partial<PerformanceRollup> = {}): PerformanceRollup {
  return {
    month: '2026-08',
    cycle_status: 'open',
    scope: 'self',
    label: 'Mia Member',
    groups: [{ group_id: DELIVERY, code: 'delivery', name: 'Delivery', sort: 1, weight: 100 }],
    scores: { [DELIVERY]: 4 },
    scored: 1,
    total: 1,
    overall: 4,
    rows: [
      {
        kind: 'project',
        id: PROJECT,
        name: 'Atlas',
        subtitle: 'Tom TL',
        is_lead: false,
        member_count: 3,
        scored: 1,
        total: 1,
        scores: { [DELIVERY]: 4 },
        overall: 4,
        children: [],
      },
    ],
    reviews: [
      {
        project_id: PROJECT,
        project_name: 'Atlas',
        evaluator_name: 'Tom TL',
        evaluator_capacity: 'tl',
        status: 'submitted',
        overall: 4,
        scores: { [DELIVERY]: 4 },
        strengths: 'shipped Atlas v2',
        improve: '',
        top_action: '',
        submitted_at: '2026-08-26T03:00:00.000Z',
      },
    ],
    ...over,
  } as PerformanceRollup;
}

/** The member's own form, unscored unless `score` is given. */
function myForm(over: Partial<EvaluationView> = {}): EvaluationView {
  return {
    month: '2026-08',
    cycle_status: 'open',
    editable: true,
    subject: {
      person_id: ME,
      full_name: 'Mia Member',
      project_id: PROJECT,
      project_name: 'Atlas',
      account_id: '44444444-4444-4444-8444-444444444444',
    },
    evaluator_capacity: 'self',
    status: 'draft',
    version: 0,
    revision_id: '55555555-5555-4555-8555-555555555555',
    overall: null,
    strengths: '',
    improve: '',
    top_action: '',
    top_action_required: false,
    submitted_at: null,
    groups: [
      {
        group_id: DELIVERY,
        code: 'delivery',
        name: 'Delivery',
        weight: 100,
        sort: 1,
        criteria: [
          {
            criterion_id: CRITERION,
            name: 'On-time delivery',
            weight: 100,
            sort: 1,
            score: null,
            evidence: '',
          },
        ],
      },
    ],
    ...over,
  };
}

function renderDashboard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(<PerformanceMemberDashboard month="2026-08" projectId={PROJECT} personId={ME} />, {
    wrapper,
  });
}

describe('PerformanceMemberDashboard — self-assessment (FUT-779)', () => {
  beforeEach(() => {
    vi.mocked(fetchPerformanceRollup).mockReset();
    vi.mocked(fetchEvaluation).mockReset();
  });

  it('invites the member to score themselves while the cycle is open', async () => {
    vi.mocked(fetchPerformanceRollup).mockResolvedValue(rollup());
    vi.mocked(fetchEvaluation).mockResolvedValue(myForm());
    renderDashboard();

    expect(
      await screen.findByRole('button', { name: 'Start self-assessment' }),
    ).toBeInTheDocument();
    // The point of the exercise is that this number is the member's own (AC3).
    expect(screen.getByText(/kept out of the official average/i)).toBeInTheDocument();
  });

  it('opens the same scoring form the manager uses, in a dialog', async () => {
    vi.mocked(fetchPerformanceRollup).mockResolvedValue(rollup());
    vi.mocked(fetchEvaluation).mockResolvedValue(myForm());
    const { container } = renderDashboard();

    await userEvent.click(await screen.findByRole('button', { name: 'Start self-assessment' }));

    await waitFor(() => expect(container.querySelector('dialog')).not.toBeNull());
    expect(await screen.findByText('My self-assessment · Atlas')).toBeInTheDocument();
    expect(screen.getByLabelText('Score for On-time delivery')).toBeInTheDocument();
  });

  it('sets the filed self-assessment against the review, so the gap is the point', async () => {
    vi.mocked(fetchPerformanceRollup).mockResolvedValue(rollup());
    vi.mocked(fetchEvaluation).mockResolvedValue(
      myForm({
        status: 'submitted',
        version: 1,
        overall: 4.5,
        submitted_at: '2026-08-26T02:00:00.000Z',
        groups: [
          {
            group_id: DELIVERY,
            code: 'delivery',
            name: 'Delivery',
            weight: 100,
            sort: 1,
            criteria: [
              {
                criterion_id: CRITERION,
                name: 'On-time delivery',
                weight: 100,
                sort: 1,
                score: 4.5,
                evidence: '',
              },
            ],
          },
        ],
      }),
    );
    renderDashboard();

    // Self 4.5 against a review of 4.0 — stated as a gap, since that is what the member
    // takes into the review conversation.
    expect(await screen.findByText(/0\.5 above/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit self-assessment' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start self-assessment' })).not.toBeInTheDocument();
  });

  it('does not claim the cycle is closed while the form is still loading', async () => {
    vi.mocked(fetchPerformanceRollup).mockResolvedValue(rollup());
    // The roll-up resolves first, so the section paints before its own query settles.
    vi.mocked(fetchEvaluation).mockReturnValue(new Promise(() => {}));
    renderDashboard();

    expect(await screen.findByText('My self-assessment')).toBeInTheDocument();
    // "Not loaded yet" is not "the window has passed" — saying so sends the member away
    // from a cycle they can still file in.
    expect(screen.queryByText(/window has passed/i)).not.toBeInTheDocument();
  });

  it('says the form could not be loaded rather than blaming the cycle', async () => {
    vi.mocked(fetchPerformanceRollup).mockResolvedValue(rollup());
    vi.mocked(fetchEvaluation).mockRejectedValue(new Error('HTTP 500'));
    renderDashboard();

    expect(await screen.findByText(/couldn't load your self-assessment/i)).toBeInTheDocument();
    expect(screen.queryByText(/window has passed/i)).not.toBeInTheDocument();
  });

  it('says nothing can be filed once the cycle is closed', async () => {
    vi.mocked(fetchPerformanceRollup).mockResolvedValue(rollup({ cycle_status: 'locked' }));
    vi.mocked(fetchEvaluation).mockResolvedValue(
      myForm({ cycle_status: 'locked', editable: false }),
    );
    renderDashboard();

    expect(await screen.findByText(/closed/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start self-assessment' })).not.toBeInTheDocument();
  });
});
