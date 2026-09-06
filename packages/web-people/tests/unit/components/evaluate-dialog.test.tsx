import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('a self-assessment never addresses the member in the third person, even before it loads', async () => {
    vi.mocked(fetchEvaluation).mockReturnValue(new Promise(() => {}));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <EvaluateDialog
        month="2026-08"
        subjectPersonId={SUBJECT}
        projectId={PROJECT}
        subjectName="Mia Member"
        isSelfAssessment
        onClose={vi.fn()}
      />,
      { wrapper: wrap(qc) },
    );

    // The caller already knows whose form this is; waiting for the fetch to say so puts
    // the member's own name in a header written for their manager.
    expect(await screen.findByText('My self-assessment')).toBeInTheDocument();
    expect(screen.queryByText('Evaluate · Mia Member')).not.toBeInTheDocument();
  });

  it('keeps an out-of-range score on screen and says what is wrong (FUT-973)', async () => {
    vi.mocked(fetchEvaluation).mockResolvedValue(view());
    renderDialog();

    expect(await screen.findByText('Evaluate · Mia Member')).toBeInTheDocument();
    const field = screen.getByLabelText('Score for On-time delivery');
    await userEvent.type(field, '6');
    await userEvent.tab();

    // This used to drop the entry on blur and leave an empty box behind, so the evaluator
    // never learned why their number had vanished. The message is tied to the field it is
    // about, so a screen reader reaches it from the box rather than hunting the page.
    expect(field).toHaveValue(6);
    expect(field).toHaveAccessibleDescription('Enter a score 1 to 5.');
    expect(field).toBeInvalid();
  });

  it('says the same below the scale, rather than blanking the field (FUT-973)', async () => {
    vi.mocked(fetchEvaluation).mockResolvedValue(view());
    renderDialog();

    expect(await screen.findByText('Evaluate · Mia Member')).toBeInTheDocument();
    const field = screen.getByLabelText('Score for On-time delivery');
    await userEvent.type(field, '0.5');
    await userEvent.tab();

    expect(field).toHaveValue(0.5);
    expect(field).toHaveAccessibleDescription('Enter a score 1 to 5.');
  });

  it('names the half-point rule instead of silently rounding to it (FUT-973)', async () => {
    vi.mocked(fetchEvaluation).mockResolvedValue(view());
    renderDialog();

    expect(await screen.findByText('Evaluate · Mia Member')).toBeInTheDocument();
    const field = screen.getByLabelText('Score for On-time delivery');
    await userEvent.type(field, '3.27');
    await userEvent.tab();

    expect(field).toHaveValue(3.27);
    // No example figure in the message: it sits beside the entry, where a stray number
    // reads as the value the field holds.
    expect(field).toHaveAccessibleDescription('Half points only.');
  });

  it('refuses the keys that would leave the box holding a non-number (FUT-973)', async () => {
    vi.mocked(fetchEvaluation).mockResolvedValue(view());
    renderDialog();

    expect(await screen.findByText('Evaluate · Mia Member')).toBeInTheDocument();
    const field = screen.getByLabelText('Score for On-time delivery');

    // `type="number"` treats these as numeric syntax and takes them, then reports the
    // value as empty — the box shows "e" or "--111" while the form sees no score at all.
    for (const key of ['e', 'E', '+', '-']) {
      expect(fireEvent.keyDown(field, { key })).toBe(false);
    }
    // Everything a score is actually made of still goes in.
    for (const key of ['3', '.', '5', 'Backspace']) {
      expect(fireEvent.keyDown(field, { key })).toBe(true);
    }
    // A modifier means a shortcut, not typing — leave it to the browser.
    expect(fireEvent.keyDown(field, { key: 'e', ctrlKey: true })).toBe(true);
  });

  it('holds back a write the server would only reject, until the score is on the scale', async () => {
    vi.mocked(fetchEvaluation).mockResolvedValue(view());
    renderDialog();

    expect(await screen.findByText('Evaluate · Mia Member')).toBeInTheDocument();
    const field = screen.getByLabelText('Score for On-time delivery');
    await userEvent.type(field, '6');

    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();

    await userEvent.clear(field);
    await userEvent.type(field, '4');

    expect(field).not.toHaveAccessibleDescription();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();
  });

  it('the steppers pull an off-scale score back onto the scale', async () => {
    vi.mocked(fetchEvaluation).mockResolvedValue(view());
    renderDialog();

    expect(await screen.findByText('Evaluate · Mia Member')).toBeInTheDocument();
    const field = screen.getByLabelText('Score for On-time delivery');
    await userEvent.type(field, '6');
    await userEvent.click(screen.getByRole('button', { name: 'Lower score for On-time delivery' }));

    expect(field).toHaveValue(5);
    expect(field).not.toHaveAccessibleDescription();
  });

  it('will not submit without the Top Action a low score demands, but still saves a draft', async () => {
    vi.mocked(fetchEvaluation).mockResolvedValue(view());
    vi.mocked(saveEvaluationDraft).mockResolvedValue(view({ version: 3 }));
    renderDialog();

    expect(await screen.findByText('Evaluate · Mia Member')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Score for On-time delivery'), '2');

    // The server refuses this outright (assertSubmittable), and the field says why —
    // tied to the field, so the disabled button has its reason on screen beside it.
    const topAction = screen.getByLabelText(/^Top action/);
    expect(topAction).toHaveAccessibleDescription('Required — a criterion scored below 4.');
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    // A draft is allowed to be half-written — only the submit is held back.
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled();

    await userEvent.type(topAction, 'Pair on estimates before the next sprint.');

    expect(topAction).not.toHaveAccessibleDescription();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();
  });

  it('leaves the manager’s written fields off a self-assessment (FUT-973)', async () => {
    vi.mocked(fetchEvaluation).mockResolvedValue(view({ evaluator_capacity: 'self' }));
    vi.mocked(saveEvaluationDraft).mockResolvedValue(view({ evaluator_capacity: 'self' }));
    renderDialog();

    expect(await screen.findByText(/My self-assessment/)).toBeInTheDocument();
    // Strengths and What to improve are the lead's read on the person; the subject
    // writing them too leaves two authors' words in one column.
    expect(screen.queryByLabelText('Strengths')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('What to improve')).not.toBeInTheDocument();
    // The Top Action is still theirs — it is the plan they commit to.
    expect(screen.getByLabelText(/^Top action/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => expect(saveEvaluationDraft).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveEvaluationDraft).mock.calls[0]?.[0]).toMatchObject({
      strengths: '',
      improve: '',
    });
  });

  it('a row written before that rule is never sent back from the subject’s seat', async () => {
    // The server refuses these from a self seat, so a form seeded with legacy text must
    // not hand it straight back on the next save.
    vi.mocked(fetchEvaluation).mockResolvedValue(
      view({
        evaluator_capacity: 'self',
        strengths: 'written before the rule',
        improve: 'and this',
      }),
    );
    vi.mocked(saveEvaluationDraft).mockResolvedValue(view({ evaluator_capacity: 'self' }));
    renderDialog();

    expect(await screen.findByText(/My self-assessment/)).toBeInTheDocument();
    expect(screen.queryByDisplayValue('written before the rule')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => expect(saveEvaluationDraft).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveEvaluationDraft).mock.calls[0]?.[0]).toMatchObject({
      strengths: '',
      improve: '',
    });
  });

  it('keeps both written fields on a manager’s evaluation', async () => {
    vi.mocked(fetchEvaluation).mockResolvedValue(view());
    renderDialog();

    expect(await screen.findByText('Evaluate · Mia Member')).toBeInTheDocument();
    expect(screen.getByLabelText('Strengths')).toBeInTheDocument();
    expect(screen.getByLabelText('What to improve')).toBeInTheDocument();
  });

  it('seals a self-assessment once submitted, and says so in its own words (FUT-973)', async () => {
    vi.mocked(fetchEvaluation).mockResolvedValue(
      view({ evaluator_capacity: 'self', status: 'submitted', editable: false }),
    );
    renderDialog();

    // Left open, the subject could restate their scores after seeing the manager's.
    expect(await screen.findByTestId('evaluate-readonly-note')).toHaveTextContent(
      /you submitted this self-assessment/i,
    );
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Re-submit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Score for On-time delivery')).not.toBeInTheDocument();
  });

  it('a self-assessment still in draft stays a form', async () => {
    vi.mocked(fetchEvaluation).mockResolvedValue(view({ evaluator_capacity: 'self' }));
    renderDialog();

    expect(await screen.findByText(/My self-assessment/)).toBeInTheDocument();
    expect(screen.queryByTestId('evaluate-readonly-note')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Score for On-time delivery')).toBeInTheDocument();
  });

  it('a manager may still re-submit their own review inside the window', async () => {
    // Only the subject's own form is sealed on submit — nobody is grading the grader.
    vi.mocked(fetchEvaluation).mockResolvedValue(view({ status: 'submitted' }));
    renderDialog();

    expect(await screen.findByText('Evaluate · Mia Member')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-submit' })).toBeInTheDocument();
  });

  it('an unlock reopens a submitted self-assessment', async () => {
    // The PMO's cycle unlock (FUT-781) is the authorised way back in; the server hands
    // the form back with editable true and the cycle in override.
    vi.mocked(fetchEvaluation).mockResolvedValue(
      view({ evaluator_capacity: 'self', status: 'submitted', cycle_status: 'override' }),
    );
    renderDialog();

    expect(await screen.findByText(/My self-assessment/)).toBeInTheDocument();
    expect(screen.queryByTestId('evaluate-readonly-note')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-submit' })).toBeInTheDocument();
  });

  it('a closed cycle is read-only — no way to save or submit', async () => {
    vi.mocked(fetchEvaluation).mockResolvedValue(view({ editable: false, cycle_status: 'locked' }));
    renderDialog();

    expect(await screen.findByTestId('evaluate-readonly-note')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument();
  });
});
