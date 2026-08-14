import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EvaluationView } from '../../../src/api/people-client.ts';

vi.mock('../../../src/api/people-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/api/people-client.ts')>()),
  fetchEvaluation: vi.fn(),
  saveEvaluationDraft: vi.fn(),
  submitEvaluation: vi.fn(),
}));

import {
  fetchEvaluation,
  saveEvaluationDraft,
  submitEvaluation,
} from '../../../src/api/people-client.ts';
import { EvaluateForm } from '../../../src/pages/evaluate-page.tsx';

const SUBJECT = '11111111-1111-4111-8111-111111111111';
const PROJECT = '22222222-2222-4222-8222-222222222222';
const CRITERION = '33333333-3333-4333-8333-333333333333';

function view(over: Partial<EvaluationView> = {}): EvaluationView {
  return {
    month: '2026-08',
    cycle_status: 'open',
    editable: true,
    subject: {
      person_id: SUBJECT,
      full_name: 'Mia Member',
      project_id: PROJECT,
      project_name: 'Atlas',
      account_id: '44444444-4444-4444-8444-444444444444',
    },
    evaluator_capacity: 'tl',
    status: 'draft',
    version: 2,
    revision_id: '55555555-5555-4555-8555-555555555555',
    overall: null,
    strengths: '',
    improve: '',
    top_action: '',
    top_action_required: false,
    submitted_at: null,
    groups: [
      {
        group_id: '66666666-6666-4666-8666-666666666666',
        code: 'delivery',
        name: 'Delivery',
        weight: 20,
        sort: 1,
        criteria: [
          {
            criterion_id: CRITERION,
            name: 'On-time delivery',
            weight: 10,
            sort: 1,
            score: null,
            evidence: '',
            evidence_required: false,
          },
        ],
      },
    ],
    ...over,
  };
}

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

function renderForm() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<EvaluateForm month="2026-08" subjectPersonId={SUBJECT} projectId={PROJECT} />, {
    wrapper: wrap(qc),
  });
}

describe('EvaluateForm', () => {
  beforeEach(() => {
    vi.mocked(fetchEvaluation).mockReset();
    vi.mocked(saveEvaluationDraft).mockReset();
    vi.mocked(submitEvaluation).mockReset();
  });

  it('submits the edited score against the version it loaded', async () => {
    vi.mocked(fetchEvaluation).mockResolvedValue(view());
    vi.mocked(submitEvaluation).mockResolvedValue(view({ status: 'submitted', version: 3 }));
    renderForm();

    expect(await screen.findByText('Mia Member')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: '4' }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(submitEvaluation).toHaveBeenCalledTimes(1));
    expect(vi.mocked(submitEvaluation).mock.calls[0]?.[0]).toMatchObject({
      month: '2026-08',
      subject_person_id: SUBJECT,
      project_id: PROJECT,
      base_version: 2,
      scores: [{ criterion_id: CRITERION, score: 4, evidence: '' }],
    });
  });

  it('a closed cycle is read-only — no way to save or submit', async () => {
    vi.mocked(fetchEvaluation).mockResolvedValue(view({ editable: false, cycle_status: 'locked' }));
    renderForm();

    expect(await screen.findByTestId('evaluate-readonly-note')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument();
  });
});
