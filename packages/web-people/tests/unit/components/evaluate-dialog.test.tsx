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
import { EvaluateDialog } from '../../../src/components/evaluate-dialog.tsx';

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
            // A share the config screen computed — the float noise must never reach the UI.
            weight: 7.000000000000001,
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

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

function renderDialog() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onClose = vi.fn();
  const utils = render(
    <EvaluateDialog
      month="2026-08"
      subjectPersonId={SUBJECT}
      projectId={PROJECT}
      onClose={onClose}
    />,
    { wrapper: wrap(qc) },
  );
  return { ...utils, onClose };
}

describe('EvaluateDialog', () => {
  beforeEach(() => {
    vi.mocked(fetchEvaluation).mockReset();
    vi.mocked(saveEvaluationDraft).mockReset();
    vi.mocked(submitEvaluation).mockReset();
  });

  it('scores the person in a dialog over the dashboard, not on a page of its own', async () => {
    vi.mocked(fetchEvaluation).mockResolvedValue(view());
    const { container } = renderDialog();

    const dialog = container.querySelector('dialog');
    expect(dialog).not.toBeNull();
    // The whole form lives inside the <dialog>, so whatever opened it stays on screen.
    expect(await screen.findByText('Evaluate · Mia Member')).toBeInTheDocument();
    expect(dialog?.contains(screen.getByText('On-time delivery'))).toBe(true);
  });

  it('shows criterion weights as a clean percentage, never a float artifact', async () => {
    vi.mocked(fetchEvaluation).mockResolvedValue(view());
    renderDialog();

    expect(await screen.findByText('7%')).toBeInTheDocument();
    expect(screen.queryByText(/7\.000000000000001/)).not.toBeInTheDocument();
  });

  it('submits the typed score against the version it loaded, then closes', async () => {
    vi.mocked(fetchEvaluation).mockResolvedValue(view());
    vi.mocked(submitEvaluation).mockResolvedValue(view({ status: 'submitted', version: 3 }));
    const { onClose } = renderDialog();

    expect(await screen.findByText('Evaluate · Mia Member')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Score for On-time delivery'), '4');
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(submitEvaluation).toHaveBeenCalledTimes(1));
    expect(vi.mocked(submitEvaluation).mock.calls[0]?.[0]).toMatchObject({
      month: '2026-08',
      subject_person_id: SUBJECT,
      project_id: PROJECT,
      base_version: 2,
      scores: [{ criterion_id: CRITERION, score: 4, evidence: '' }],
    });
    // Submitting is the end of the task — hand the dashboard back.
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('saving a draft keeps the dialog open so the evaluator can carry on', async () => {
    vi.mocked(fetchEvaluation).mockResolvedValue(view());
    vi.mocked(saveEvaluationDraft).mockResolvedValue(view({ version: 3 }));
    const { onClose } = renderDialog();

    expect(await screen.findByText('Evaluate · Mia Member')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => expect(saveEvaluationDraft).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('takes a half point, and nothing finer than that', async () => {
    vi.mocked(fetchEvaluation).mockResolvedValue(view());
    vi.mocked(saveEvaluationDraft).mockResolvedValue(view({ version: 3 }));
    renderDialog();

    expect(await screen.findByText('Evaluate · Mia Member')).toBeInTheDocument();
    // 3.5 is a score on this scale; 3.25 is not, and the server rejects it outright.
    await userEvent.type(screen.getByLabelText('Score for On-time delivery'), '3.5');
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => expect(saveEvaluationDraft).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveEvaluationDraft).mock.calls[0]?.[0]).toMatchObject({
      scores: [{ criterion_id: CRITERION, score: 3.5 }],
    });
  });

  it('steps the score up and down by a half point', async () => {
    vi.mocked(fetchEvaluation).mockResolvedValue(view());
    vi.mocked(saveEvaluationDraft).mockResolvedValue(view({ version: 3 }));
    renderDialog();

    expect(await screen.findByText('Evaluate · Mia Member')).toBeInTheDocument();
    const field = screen.getByLabelText('Score for On-time delivery');
    await userEvent.type(field, '4');
    await userEvent.click(screen.getByRole('button', { name: 'Lower score for On-time delivery' }));

    expect(field).toHaveValue(3.5);

    await userEvent.click(screen.getByRole('button', { name: 'Raise score for On-time delivery' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => expect(saveEvaluationDraft).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveEvaluationDraft).mock.calls[0]?.[0]).toMatchObject({
      scores: [{ criterion_id: CRITERION, score: 4 }],
    });
  });

  it('collects a score and nothing else — no evidence field at any point on the scale', async () => {
    vi.mocked(fetchEvaluation).mockResolvedValue(view());
    renderDialog();

    expect(await screen.findByText('Evaluate · Mia Member')).toBeInTheDocument();
    // An end-of-scale score used to demand justification; the form is numbers only now.
    await userEvent.type(screen.getByLabelText('Score for On-time delivery'), '5');
    expect(screen.queryByLabelText(/Evidence/)).not.toBeInTheDocument();
  });

  it('a closed cycle is read-only — no way to save or submit', async () => {
    vi.mocked(fetchEvaluation).mockResolvedValue(view({ editable: false, cycle_status: 'locked' }));
    renderDialog();

    expect(await screen.findByTestId('evaluate-readonly-note')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument();
  });
});
