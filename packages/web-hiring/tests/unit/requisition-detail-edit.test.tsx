import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const editRequisition = vi.fn();

// A requisition created long ago: its stored start date is already in the past. Editing
// unrelated fields must stay possible — only NEW date values are held to "not in the past".
const DETAIL = {
  requisition: {
    id: 'r1',
    title: 'Backend Engineer',
    role_title: null,
    grade: 'L4',
    account_id: null,
    project_id: null,
    kind: 'new',
    approval_status: 'approved',
    status: 'open',
    stage: 'sourcing',
    owner_user_id: null,
    due_date: null,
    start_date: '2020-01-01',
    note: null,
    default_interview_mode: 'online',
    closed_at: null,
    created_at: '2020-01-01T00:00:00Z',
    version: 1,
  },
  account_name: null,
  project_name: null,
  openings: [],
  jd_sections: [
    { requisition_id: 'r1', variant: 'external', section: 'about', body: '<p>About</p>' },
  ],
  skills: [],
  applicants: [],
};

vi.mock('../../src/api/hiring-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/api/hiring-client.ts')>()),
  fetchRequisition: () => Promise.resolve(structuredClone(DETAIL)),
  fetchAccounts: () => Promise.resolve([]),
  fetchProjects: () => Promise.resolve([]),
  fetchSkillCatalog: () => Promise.resolve({ categories: [], skills: [] }),
  editRequisition: (id: unknown, input: unknown) => editRequisition(id, input),
}));

vi.mock('@seta/web-identity', () => ({ usePermission: () => true }));

// TipTap doesn't fully initialize under jsdom; a plain textarea keeps the form testable.
vi.mock('@seta/shared-ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@seta/shared-ui')>();
  return {
    ...actual,
    RichTextEditor: ({
      value,
      onChange,
      placeholder,
    }: {
      value: string;
      onChange: (html: string) => void;
      placeholder?: string;
    }) => (
      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    ),
  };
});

import { RequisitionDetailView } from '../../src/pages/requisition-detail-view.tsx';

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

async function openEditor() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<RequisitionDetailView requisitionId="r1" variant="page" />, { wrapper: wrap(qc) });
  await userEvent.click(await screen.findByRole('button', { name: /^edit$/i }));
  await screen.findByLabelText(/job title/i);
}

describe('RequisitionDetailView editing', () => {
  beforeEach(() => editRequisition.mockReset());

  it('keeps a past date from being set as the start date', async () => {
    await openEditor();
    // The start picker disables every day before today, so a past value is rejected outright —
    // nothing invalid reaches the save.
    fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2000-01-01' } });
    await userEvent.click(screen.getByRole('button', { name: /^update$/i }));

    expect(editRequisition).not.toHaveBeenCalled();
  });

  it('rejects a due date earlier than the start date', async () => {
    editRequisition.mockResolvedValueOnce({ version: 2 });
    await openEditor();
    fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2999-01-02' } });
    // The due picker's minimum is the start date, so this earlier value is not taken; the save
    // goes through with the valid start and no due date.
    fireEvent.change(screen.getByLabelText(/due date/i), { target: { value: '2999-01-01' } });
    await userEvent.click(screen.getByRole('button', { name: /^update$/i }));

    await waitFor(() =>
      expect(editRequisition).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({
          patch: expect.objectContaining({ start_date: '2999-01-02', due_date: undefined }),
        }),
      ),
    );
  });

  it('still saves when the stored past start date is left untouched', async () => {
    editRequisition.mockResolvedValueOnce({ version: 2 });
    await openEditor();
    await userEvent.type(screen.getByLabelText(/job title/i), ' II');
    await userEvent.click(screen.getByRole('button', { name: /^update$/i }));

    await waitFor(() =>
      expect(editRequisition).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({
          patch: expect.objectContaining({
            title: 'Backend Engineer II',
            start_date: '2020-01-01',
          }),
        }),
      ),
    );
  });

  it('asks before discarding edits and honors both answers', async () => {
    await openEditor();
    await userEvent.type(screen.getByLabelText(/job title/i), ' II');
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(screen.getByText('Discard your changes?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /keep editing/i }));
    expect(screen.getByLabelText(/job title/i)).toHaveValue('Backend Engineer II');

    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    await userEvent.click(screen.getByRole('button', { name: /^discard$/i }));
    expect(await screen.findByRole('button', { name: /^edit$/i })).toBeInTheDocument();
  });

  it('cancels immediately when nothing changed', async () => {
    await openEditor();
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(screen.queryByText('Discard your changes?')).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /^edit$/i })).toBeInTheDocument();
  });

  it('validates job title max length (100 chars) and shows inline warning/error messages when editing (FUT-789)', async () => {
    await openEditor();

    const titleInput = screen.getByLabelText(/job title/i);

    // 100 chars triggers warning status
    fireEvent.change(titleInput, { target: { value: 'B'.repeat(100) } });
    expect(screen.getByText('Maximum limit of 100 characters reached.')).toBeInTheDocument();

    // >100 chars triggers error status and blocks save
    fireEvent.change(titleInput, { target: { value: 'B'.repeat(105) } });
    expect(screen.getByText('Job title cannot exceed 100 characters.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^update$/i }));
    expect(editRequisition).not.toHaveBeenCalled();
  });
});
