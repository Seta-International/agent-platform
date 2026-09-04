import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchCandidates = vi.fn();
const scheduleInterview = vi.fn();
vi.mock('../../src/api/hiring-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/api/hiring-client.ts')>()),
  fetchCandidates: () => fetchCandidates(),
  scheduleInterview: (input: unknown) => scheduleInterview(input),
}));

const fetchDirectoryUsers = vi.fn();
vi.mock('../../src/api/identity-directory.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/api/identity-directory.ts')>()),
  fetchDirectoryUsers: () => fetchDirectoryUsers(),
}));

import { ScheduleInterviewDialog } from '../../src/pages/schedule-interview-dialog.tsx';

function candidateRow(over: Record<string, unknown>) {
  return {
    application_id: 'a1',
    candidate_id: 'c1',
    name: 'Oliver Beahan',
    seniority: null,
    source: null,
    requisition_id: 'r1',
    requisition_title: 'React Developer',
    requisition_status: 'open',
    stage: 'screening',
    status: 'active',
    rating: null,
    version: 1,
    applied_at: '2026-08-01T00:00:00.000Z',
    skills: [],
    required_skills: [],
    fit: { met: 0, required: 0, score: 0, strong: false },
    ...over,
  };
}

beforeEach(() => {
  scheduleInterview.mockReset().mockResolvedValue({ interview_id: 'i1', version: 1 });
  fetchDirectoryUsers
    .mockReset()
    .mockResolvedValue([{ user_id: 'u1', email: 'p1@seta.io', name: 'Panelist One' }]);
  fetchCandidates.mockReset().mockResolvedValue([
    candidateRow({}),
    candidateRow({ application_id: 'a2', candidate_id: 'c2', name: 'Mara Quinn' }),
    candidateRow({
      application_id: 'a3',
      candidate_id: 'c3',
      name: 'Dana Fisk',
      requisition_id: 'r2',
      requisition_title: 'Platform Engineer',
    }),
    candidateRow({
      application_id: 'a4',
      candidate_id: 'c4',
      name: 'Rejected Rick',
      requisition_id: 'r3',
      requisition_title: 'Closed Role',
      status: 'rejected',
    }),
  ]);
});

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

function renderDialog(presetCandidateId?: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <ScheduleInterviewDialog
      isOpen
      onOpenChange={() => {}}
      presetCandidateId={presetCandidateId ?? null}
      onScheduled={() => {}}
    />,
    { wrapper: wrap(qc) },
  );
  return { qc, dialog: screen.getByRole('dialog') };
}

function fieldTrigger(dialog: HTMLElement, name: RegExp): HTMLElement {
  const q = within(dialog);
  return q.queryByRole('combobox', { name }) ?? q.getByRole('button', { name });
}

async function openSelector(dialog: HTMLElement, name: RegExp) {
  const trigger = fieldTrigger(dialog, name);
  await userEvent.click(trigger);
  return trigger;
}

describe('ScheduleInterviewDialog', () => {
  it('offers only requisitions with an active candidate, and scopes the candidate list to the pick', async () => {
    const { dialog } = renderDialog();
    await waitFor(() => expect(fieldTrigger(dialog, /requisition/i)).toBeEnabled());

    await openSelector(dialog, /requisition/i);
    const options = await screen.findAllByRole('option');
    const titles = options.map((o) => o.textContent ?? '');
    expect(titles.some((t) => t.includes('React Developer'))).toBe(true);
    expect(titles.some((t) => t.includes('Platform Engineer'))).toBe(true);
    expect(titles.some((t) => t.includes('Closed Role'))).toBe(false);
    expect(titles.find((t) => t.includes('React Developer'))).toContain('2 candidates');

    await userEvent.click(
      options.find((o) => o.textContent?.includes('React Developer')) as HTMLElement,
    );

    await openSelector(dialog, /candidate/i);
    const names = (await screen.findAllByRole('option')).map((o) => o.textContent ?? '');
    expect(names.some((n) => n.includes('Oliver Beahan'))).toBe(true);
    expect(names.some((n) => n.includes('Mara Quinn'))).toBe(true);
    expect(names.some((n) => n.includes('Dana Fisk'))).toBe(false);
  });

  it('leaves the candidate picker disabled until a requisition is chosen', async () => {
    const { dialog } = renderDialog();
    await waitFor(() => expect(fieldTrigger(dialog, /requisition/i)).toBeEnabled());
    const candidate = fieldTrigger(dialog, /candidate/i);
    expect(candidate).toBeDisabled();
    expect(candidate).toHaveTextContent('Pick a requisition first');
  });

  it('resolves both pickers from a preset candidate and schedules without a round', async () => {
    const { dialog } = renderDialog('c3');
    await waitFor(() =>
      expect(fieldTrigger(dialog, /requisition/i)).toHaveTextContent('Platform Engineer'),
    );
    expect(fieldTrigger(dialog, /candidate/i)).toHaveTextContent('Dana Fisk');

    fireEvent.change(within(dialog).getByLabelText('Date'), { target: { value: '2026-09-10' } });
    await openSelector(dialog, /interview panel/i);
    await userEvent.click(await screen.findByRole('option', { name: /Panelist One/ }));

    await userEvent.click(within(dialog).getByRole('button', { name: /^schedule$/i }));

    await waitFor(() => expect(scheduleInterview).toHaveBeenCalled());
    const payload = scheduleInterview.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.application_id).toBe('a3');
    expect(payload).not.toHaveProperty('round');
    expect(payload.panel).toEqual([{ user_id: 'u1', display_name: 'Panelist One' }]);
  });

  it('flags the missing requisition instead of scheduling', async () => {
    const { dialog } = renderDialog();
    await waitFor(() => expect(fieldTrigger(dialog, /requisition/i)).toBeEnabled());
    await userEvent.click(within(dialog).getByRole('button', { name: /^schedule$/i }));
    expect(await within(dialog).findByText('Pick a requisition.')).toBeInTheDocument();
    expect(scheduleInterview).not.toHaveBeenCalled();
  });
});
