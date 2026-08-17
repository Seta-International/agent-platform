import { FileInput } from '@seta/shared-ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CandidateCvDraft } from '../../src/api/hiring-client.ts';

const addCandidate = vi.fn();
const parseCandidateCvDraft =
  vi.fn<(file: File, signal?: AbortSignal) => Promise<CandidateCvDraft>>();
const fetchRequisitions = vi.fn();
vi.mock('../../src/api/hiring-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/api/hiring-client.ts')>()),
  addCandidate: (input: unknown) => addCandidate(input),
  parseCandidateCvDraft: (file: File, signal?: AbortSignal) => parseCandidateCvDraft(file, signal),
  fetchRequisitions: () => fetchRequisitions(),
  fetchSkillCatalog: () =>
    Promise.resolve({
      categories: [{ id: 'cat1', name: 'Backend', sort_order: 0, active: true }],
      skills: [{ id: 's1', name: 'TypeScript', category_id: 'cat1', active: true }],
    }),
}));

import { NewCandidateDialog } from '../../src/pages/new-candidate-dialog.tsx';

beforeEach(() => {
  // Real rows always carry openings_open; the default has remaining headcount so it stays a
  // selectable position (the openings_open > 0 guard only removes filled requisitions).
  fetchRequisitions
    .mockReset()
    .mockResolvedValue([{ id: 'r1', title: 'Backend Eng', status: 'open', openings_open: 3 }]);
  parseCandidateCvDraft.mockReset();
});

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

// Astryx's FieldLabel applies sr-only styling to `description` too whenever
// `isLabelHidden` is set on the field (see @astryxdesign/core FieldLabel.tsx) — the
// original regression this suite must catch. Plain `getByText` can't see that: it only
// asserts DOM presence, not the sr-only clip/1px-box treatment StyleX layers on top.
// Derive the exact "sr-only extra" class signature at test time (rather than hardcoding
// StyleX's atomic hashes) by diffing a known-hidden field's description classes against
// a known-visible one, then assert the real hint carries none of them.
function srOnlyExtraClasses(): Set<string> {
  const { container: hidden } = render(
    <FileInput
      label="probe"
      isLabelHidden
      description="probe-description"
      value={null}
      onChange={() => {}}
    />,
  );
  const { container: visible } = render(
    <FileInput label="probe" description="probe-description" value={null} onChange={() => {}} />,
  );
  const hiddenDesc = Array.from(hidden.querySelectorAll('span')).find(
    (el) => el.textContent === 'probe-description',
  );
  const visibleDesc = Array.from(visible.querySelectorAll('span')).find(
    (el) => el.textContent === 'probe-description',
  );
  const hiddenSet = new Set((hiddenDesc?.className ?? '').split(' '));
  const visibleSet = new Set((visibleDesc?.className ?? '').split(' '));
  return new Set([...hiddenSet].filter((c) => !visibleSet.has(c)));
}

describe('NewCandidateDialog', () => {
  // Astryx's real Dialog always mounts <dialog> + children regardless of `isOpen`. purpose="form"
  // renders role="dialog" only once open; DialogHeader doesn't wire aria-labelledby, so assert the
  // title via its heading rather than the dialog's accessible name — matching this batch's
  // established pattern.
  it('is not exposed as a dialog until the trigger is clicked, then opens with the create-form heading', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NewCandidateDialog />, { wrapper: wrap(qc) });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /new candidate/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'New candidate' })).toBeInTheDocument();
  });

  it('submits addCandidate with the entered name and selected role', async () => {
    addCandidate.mockResolvedValueOnce({ candidate_id: 'c1', application_id: 'a1' });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NewCandidateDialog />, { wrapper: wrap(qc) });
    await userEvent.click(screen.getByRole('button', { name: /new candidate/i }));
    await userEvent.type(screen.getByLabelText(/full name/i), 'Ada Lovelace');
    await waitFor(() =>
      expect(qc.getQueryState(['hiring', 'requisitions', 'options'])?.status).toBe('success'),
    );
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /position applied/i })).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('combobox', { name: /position applied/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Backend Eng' }));
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));
    await waitFor(() =>
      expect(addCandidate).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Ada Lovelace', requisition_id: 'r1' }),
      ),
    );
  });

  it('displays inline error and blocks submission when position applied is left unselected (FUT-644)', async () => {
    addCandidate.mockClear();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NewCandidateDialog />, { wrapper: wrap(qc) });
    await userEvent.click(screen.getByRole('button', { name: /new candidate/i }));
    await userEvent.type(screen.getByLabelText(/full name/i), 'Ada Lovelace');
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /position applied/i })).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));
    expect(addCandidate).not.toHaveBeenCalled();
    expect(screen.getByText('Position applied is required.')).toBeInTheDocument();
  });

  // FUT-765: a filled requisition keeps status 'open' once its headcount is hired out, so the
  // status check alone still lists it in the position picker. It must be excluded — a candidate
  // added there can never be hired. Here the filled r1 is listed before the open r2.
  it('excludes a headcount-filled requisition from the position picker', async () => {
    fetchRequisitions.mockResolvedValueOnce([
      { id: 'r1', title: 'Filled Role', status: 'open', openings_open: 0 },
      { id: 'r2', title: 'Open Role', status: 'open', openings_open: 2 },
    ]);
    addCandidate.mockResolvedValueOnce({ candidate_id: 'c1', application_id: 'a1' });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NewCandidateDialog />, { wrapper: wrap(qc) });
    await userEvent.click(screen.getByRole('button', { name: /new candidate/i }));
    await userEvent.type(screen.getByLabelText(/full name/i), 'Ada Lovelace');
    await waitFor(() =>
      expect(qc.getQueryState(['hiring', 'requisitions', 'options'])?.status).toBe('success'),
    );
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /position applied/i })).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('combobox', { name: /position applied/i }));
    expect(screen.queryByRole('option', { name: 'Filled Role' })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('option', { name: 'Open Role' }));
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));
    await waitFor(() =>
      expect(addCandidate).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Ada Lovelace', requisition_id: 'r2' }),
      ),
    );
  });

  // Cancel must mirror the close (X) button: with unsaved input it opens the discard confirmation
  // (an alertdialog) rather than dropping the form silently. The AlertDialog title is always in
  // the DOM, so openness is asserted via the alertdialog role, not text presence.
  it('opens the discard confirmation when Cancel is clicked with unsaved input', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NewCandidateDialog />, { wrapper: wrap(qc) });
    await userEvent.click(screen.getByRole('button', { name: /new candidate/i }));
    await userEvent.type(screen.getByLabelText(/full name/i), 'Ada Lovelace');

    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    const confirm = await screen.findByRole('alertdialog');
    expect(within(confirm).getByText('Discard this candidate?')).toBeInTheDocument();
  });

  // The confirmation is only for unsaved work — an untouched form closes on Cancel with no prompt.
  it('closes without confirmation when Cancel is clicked on a pristine form', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NewCandidateDialog />, { wrapper: wrap(qc) });
    await userEvent.click(screen.getByRole('button', { name: /new candidate/i }));

    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('renders the CV upload label and format hint visibly, not screen-reader-only', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NewCandidateDialog />, { wrapper: wrap(qc) });
    await userEvent.click(screen.getByRole('button', { name: /new candidate/i }));

    const label = screen.getByText('Upload CV to auto-fill', { selector: 'label' });
    const hint = screen.getByText(/PDF or DOCX, up to 10MB/);
    const extra = srOnlyExtraClasses();
    expect(extra.size).toBeGreaterThan(0); // sanity: the probe actually detects a difference

    const labelClasses = new Set(label.className.split(' '));
    const hintClasses = new Set(hint.className.split(' '));
    expect([...extra].filter((c) => labelClasses.has(c))).toEqual([]);
    expect([...extra].filter((c) => hintClasses.has(c))).toEqual([]);
  });

  it('does not crash when the requisitions-board query already cached an object under the shared key (FUT-335)', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // Simulates having visited the Requisitions board first: requisitions-page.tsx caches an
    // `OpenRequisitionsBoard` object (not an array) under the same ['hiring','requisitions'] key
    // that fetchRequisitions() (a plain array) also used before this fix.
    qc.setQueryData(['hiring', 'requisitions'], {
      scope: 'all',
      scoped_account_names: [],
      scoped_project_names: [],
      requisitions: [],
    });
    render(<NewCandidateDialog />, { wrapper: wrap(qc) });
    await userEvent.click(screen.getByRole('button', { name: /new candidate/i }));
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /position applied/i })).toBeInTheDocument(),
    );
  });

  it('shows inline error for invalid name (FUT-623)', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NewCandidateDialog />, { wrapper: wrap(qc) });
    await userEvent.click(screen.getByRole('button', { name: /new candidate/i }));
    await userEvent.type(screen.getByLabelText(/full name/i), '12345');
    await waitFor(() => {
      expect(screen.getByText(/valid person name/i)).toBeInTheDocument();
    });
  });

  it('displays inline error and blocks submission when invalid phone number is entered, but accepts international format with spaces (FUT-625)', async () => {
    addCandidate.mockClear();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NewCandidateDialog />, { wrapper: wrap(qc) });
    await userEvent.click(screen.getByRole('button', { name: /new candidate/i }));
    await userEvent.type(screen.getByLabelText(/full name/i), 'Invalid Phone Test');
    await userEvent.type(screen.getByLabelText(/phone/i), 'invalid_phone_abc');

    await waitFor(() =>
      expect(screen.getByText('Enter a valid phone number.')).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));
    expect(addCandidate).not.toHaveBeenCalled();

    // Now type a valid international phone number containing spaces
    const phoneInput = screen.getByLabelText(/phone/i);
    await userEvent.clear(phoneInput);
    await userEvent.type(phoneInput, '+49 123 456 789');

    await waitFor(() =>
      expect(screen.queryByText('Enter a valid phone number.')).not.toBeInTheDocument(),
    );
  });

  /** Astryx FileInput renders the native input hidden + a div[role=button] with the same label.
   *  queryFileInput finds the hidden <input type="file"> for userEvent.upload. */
  function queryFileInput(): HTMLInputElement {
    const both = screen.getAllByLabelText(/upload cv to auto-fill/i);
    const input = both.find(
      (el): el is HTMLInputElement => el.tagName === 'INPUT' && el.getAttribute('type') === 'file',
    );
    if (!input) throw new Error('File input not found');
    return input;
  }

  it('does not fill stale parsed data when parse resolves after close (FUT-735)', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NewCandidateDialog />, { wrapper: wrap(qc) });
    await userEvent.click(screen.getByRole('button', { name: /new candidate/i }));

    let resolve!: (draft: CandidateCvDraft) => void;
    const deferred = new Promise<CandidateCvDraft>((r) => {
      resolve = r;
    });
    parseCandidateCvDraft.mockReturnValueOnce(deferred);

    await userEvent.upload(
      queryFileInput(),
      new File(['dummy'], 'resume.pdf', { type: 'application/pdf' }),
    );

    expect(screen.getByText('resume.pdf')).toBeInTheDocument();
    expect(screen.getByText(/parsing/i)).toBeInTheDocument();

    // An uploaded CV makes the form dirty, so Cancel now prompts to confirm the discard —
    // click through it to actually close (and abort the parse).
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    await userEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /new candidate/i }));

    resolve({
      name: 'Stale Name',
      personal_email: 'stale@example.com',
      phone: '+84900000000',
      dob: '1990-01-01',
      gender: 'male',
      seniority: 'Senior',
      note: 'stale note',
      skills: [],
      skill_suggestions: [],
      cv_sha256: 'abc',
      possible_duplicates: [],
    });
    await vi.waitFor(() => {
      const nameInput = screen.getByLabelText(/full name/i) as HTMLInputElement;
      expect(nameInput.value).toBe('');
    });
  });

  it('does not fill data when remove CV button clicked during parse (FUT-735)', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NewCandidateDialog />, { wrapper: wrap(qc) });
    await userEvent.click(screen.getByRole('button', { name: /new candidate/i }));

    let resolve!: (draft: CandidateCvDraft) => void;
    const deferred = new Promise<CandidateCvDraft>((r) => {
      resolve = r;
    });
    parseCandidateCvDraft.mockReturnValueOnce(deferred);

    await userEvent.upload(
      queryFileInput(),
      new File(['dummy'], 'resume.pdf', { type: 'application/pdf' }),
    );
    expect(screen.getByText('resume.pdf')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /remove cv/i }));
    await waitFor(() => expect(screen.queryByText('resume.pdf')).not.toBeInTheDocument());

    resolve({
      name: 'Stale After Remove',
      personal_email: 'remove-stale@example.com',
      phone: '+84900000001',
      dob: '1990-02-02',
      gender: 'female',
      seniority: 'Junior',
      note: '',
      skills: [],
      skill_suggestions: ['React'],
      cv_sha256: 'def',
      possible_duplicates: [],
    });
    await vi.waitFor(() => {
      const nameInput = screen.getByLabelText(/full name/i) as HTMLInputElement;
      expect(nameInput.value).toBe('');
    });
  });

  it('aborts the in-flight parse when form is closed (FUT-735)', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NewCandidateDialog />, { wrapper: wrap(qc) });
    await userEvent.click(screen.getByRole('button', { name: /new candidate/i }));

    let capturedSignal: AbortSignal | undefined;
    parseCandidateCvDraft.mockImplementationOnce((_file: File, signal?: AbortSignal) => {
      capturedSignal = signal;
      return new Promise<CandidateCvDraft>(() => {});
    });

    await userEvent.upload(
      queryFileInput(),
      new File(['dummy'], 'resume.pdf', { type: 'application/pdf' }),
    );
    await vi.waitFor(() => expect(capturedSignal).toBeDefined());
    expect(capturedSignal!.aborted).toBe(false);

    // Dirty form (CV uploaded) → Cancel prompts to confirm; Discard closes and aborts the parse.
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    await userEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await vi.waitFor(() => expect(capturedSignal!.aborted).toBe(true));
  });

  it('displays inline error and blocks submission when invalid calendar date or browser badInput is entered (FUT-624)', async () => {
    addCandidate.mockClear();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NewCandidateDialog />, { wrapper: wrap(qc) });
    await userEvent.click(screen.getByRole('button', { name: /new candidate/i }));
    await userEvent.type(screen.getByLabelText(/full name/i), 'Invalid DOB Test');

    const dobInput = screen.getByLabelText(/date of birth/i);

    // Mock native browser badInput flag (e.g. Feb 31 typed directly in browser date picker)
    Object.defineProperty(dobInput, 'validity', {
      get: () => ({ badInput: true, valid: false }),
      configurable: true,
    });
    fireEvent.blur(dobInput);

    await waitFor(() => expect(screen.getByText('Invalid calendar date.')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));
    expect(addCandidate).not.toHaveBeenCalled();
  });

  // FUT-633: upload CV A → parse resolves → user removes CV (X) → upload CV B
  // All fields must show B's data, not a mix of A and B.
  it('replaces all pre-filled data when a second CV is uploaded after removing the first one', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NewCandidateDialog />, { wrapper: wrap(qc) });
    await userEvent.click(screen.getByRole('button', { name: /new candidate/i }));

    // --- Upload CV A ---
    parseCandidateCvDraft.mockResolvedValueOnce({
      name: 'Alice A',
      personal_email: 'alice@a.com',
      phone: '+84111111111',
      dob: '1990-01-01',
      gender: 'female',
      seniority: 'Senior',
      note: 'note from A',
      skills: [{ skill_id: 's1', skill_name: 'React' }],
      skill_suggestions: ['GraphQL'],
      cv_sha256: 'sha-a',
      possible_duplicates: [
        { candidate_id: 'dup1', name: 'Duplicate A', created_at: '2025-01-01', match: 'file' },
      ],
    });

    await userEvent.upload(
      queryFileInput(),
      new File(['dummy'], 'cv-a.pdf', { type: 'application/pdf' }),
    );
    await vi.waitFor(() => {
      expect((screen.getByLabelText(/full name/i) as HTMLInputElement).value).toBe('Alice A');
    });

    // --- Click Remove (X) to clear CV A ---
    await userEvent.click(screen.getByLabelText(/remove cv/i));
    // FileInput should re-appear (CV area hidden)
    await vi.waitFor(() => {
      expect(queryFileInput()).toBeInTheDocument();
    });
    // Fields must be blank after remove
    expect((screen.getByLabelText(/full name/i) as HTMLInputElement).value).toBe('');

    // --- Upload CV B ---
    parseCandidateCvDraft.mockResolvedValueOnce({
      name: 'Bob B',
      personal_email: 'bob@b.com',
      phone: '+84222222222',
      dob: '1991-02-02',
      gender: 'male',
      seniority: 'Mid',
      note: 'note from B',
      skills: [{ skill_id: 's2', skill_name: 'Python' }],
      skill_suggestions: ['Django'],
      cv_sha256: 'sha-b',
      possible_duplicates: [
        { candidate_id: 'dup2', name: 'Duplicate B', created_at: '2025-01-01', match: 'email' },
      ],
    });

    await userEvent.upload(
      queryFileInput(),
      new File(['dummy'], 'cv-b.pdf', { type: 'application/pdf' }),
    );

    // All fields must show B's data now
    await vi.waitFor(() => {
      expect((screen.getByLabelText(/full name/i) as HTMLInputElement).value).toBe('Bob B');
      expect((screen.getByLabelText(/email/i) as HTMLInputElement).value).toBe('bob@b.com');
      expect((screen.getByLabelText(/phone/i) as HTMLInputElement).value).toBe('+84222222222');
      expect((screen.getByLabelText(/date of birth/i) as HTMLInputElement).value).toBe(
        '1991-02-02',
      );
    });
  });

  // FUT-633: remove CV (X) then upload a different one — the removed CV's data must not persist.
  it('clears all pre-filled data when CV is removed, then fills with new CV data on subsequent upload', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NewCandidateDialog />, { wrapper: wrap(qc) });
    await userEvent.click(screen.getByRole('button', { name: /new candidate/i }));

    // --- Upload CV A ---
    parseCandidateCvDraft.mockResolvedValueOnce({
      name: 'Alice A',
      personal_email: 'alice@a.com',
      phone: '+84111111111',
      dob: '1990-01-01',
      gender: 'female',
      seniority: 'Senior',
      note: 'note from A',
      skills: [{ skill_id: 's1', skill_name: 'React' }],
      skill_suggestions: ['GraphQL'],
      cv_sha256: 'sha-a',
      possible_duplicates: [],
    });

    await userEvent.upload(
      queryFileInput(),
      new File(['dummy'], 'cv-a.pdf', { type: 'application/pdf' }),
    );
    await vi.waitFor(() => {
      expect((screen.getByLabelText(/full name/i) as HTMLInputElement).value).toBe('Alice A');
    });

    // --- Click X (remove CV A) ---
    await userEvent.click(screen.getByRole('button', { name: /remove cv/i }));
    await vi.waitFor(() => expect(screen.queryByText('cv-a.pdf')).not.toBeInTheDocument());
    // Fields must be cleared after removing CV
    expect((screen.getByLabelText(/full name/i) as HTMLInputElement).value).toBe('');

    // --- Upload CV B ---
    parseCandidateCvDraft.mockResolvedValueOnce({
      name: 'Bob B',
      personal_email: 'bob@b.com',
      phone: '+84222222222',
      dob: null,
      gender: null,
      seniority: null,
      note: null,
      skills: [],
      skill_suggestions: [],
      cv_sha256: 'sha-b',
      possible_duplicates: [],
    });

    await userEvent.upload(
      queryFileInput(),
      new File(['dummy'], 'cv-b.pdf', { type: 'application/pdf' }),
    );
    await vi.waitFor(() => {
      expect((screen.getByLabelText(/full name/i) as HTMLInputElement).value).toBe('Bob B');
      expect((screen.getByLabelText(/email/i) as HTMLInputElement).value).toBe('bob@b.com');
      expect((screen.getByLabelText(/phone/i) as HTMLInputElement).value).toBe('+84222222222');
    });
  });
});
