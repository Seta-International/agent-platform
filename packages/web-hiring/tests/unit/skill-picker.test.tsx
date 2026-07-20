import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SkillCatalog } from '../../src/api/hiring-client.ts';
import { fetchSkillCatalog } from '../../src/api/hiring-client.ts';
import { SkillPicker } from '../../src/pages/skill-picker.tsx';
import { hiringKeys } from '../../src/state/query-keys.ts';

vi.mock('../../src/api/hiring-client.ts', () => ({
  fetchSkillCatalog: vi.fn().mockResolvedValue({
    categories: [
      { id: 'c1', name: 'Backend' },
      { id: 'c2', name: 'Frontend' },
    ],
    skills: [
      { id: 's1', name: 'Postgres', category_id: 'c1', active: true },
      { id: 's2', name: 'React', category_id: 'c2', active: true },
      { id: 's3', name: 'Retired', category_id: 'c2', active: false },
    ],
  }),
}));

function renderPicker() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onChange = vi.fn();
  const utils = render(
    <QueryClientProvider client={qc}>
      <SkillPicker value={[]} onChange={onChange} />
    </QueryClientProvider>,
  );
  return { ...utils, onChange, qc };
}

// The skill catalog loads asynchronously (useQuery), and the dropdown's
// search source is derived from it — searching before the query settles would
// hit a stale, empty source. Wait for the cache to hold the resolved catalog
// before driving the field, so tests exercise the real (loaded) dropdown.
async function waitForCatalog(qc: QueryClient) {
  await waitFor(() => expect(qc.getQueryData(hiringKeys.skillCatalog())).toBeDefined());
}

describe('SkillPicker', () => {
  it('adds a picked skill when a catalog skill is selected', async () => {
    const { onChange, qc } = renderPicker();
    const input = await screen.findByPlaceholderText(/search skills/i);
    await waitForCatalog(qc);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Postgres' } });
    fireEvent.click(await screen.findByText('Postgres'));
    expect(onChange).toHaveBeenCalledWith([{ skill_id: 's1', skill_name: 'Postgres' }]);
  });

  it('omits inactive catalog skills from the dropdown', async () => {
    const { qc } = renderPicker();
    const input = await screen.findByPlaceholderText(/search skills/i);
    await waitForCatalog(qc);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Retired' } });
    expect(screen.queryByText('Retired')).toBeNull();
  });

  // Regression: BaseTypeahead's search is event-driven — it runs against
  // whatever searchSource existed at the moment of the input event. If the
  // field were interactive while the catalog query is still pending, typing
  // would search an empty source and the dropdown would stay empty forever
  // (only self-healing on a manual clear + retype). The fix disables the
  // field until the catalog resolves, so the source is never queried empty.
  it('disables the field while the skill catalog is loading, then enables it with a queryable source once loaded', async () => {
    let resolveCatalog!: (value: SkillCatalog) => void;
    const pending = new Promise<SkillCatalog>((resolve) => {
      resolveCatalog = resolve;
    });
    vi.mocked(fetchSkillCatalog).mockReturnValueOnce(pending);

    renderPicker();
    const input = await screen.findByPlaceholderText(/search skills/i);

    // Still loading: the field must be non-interactive so it can't be
    // searched against the not-yet-populated source.
    expect(input).toHaveAttribute('aria-disabled', 'true');

    resolveCatalog({
      categories: [{ id: 'c1', name: 'Backend', sort_order: 0, active: true }],
      skills: [{ id: 's1', name: 'Postgres', category_id: 'c1', active: true }],
    });

    // Once the catalog resolves, the field enables and the now fully
    // populated source is queryable. Clear the input before retyping the
    // same query — React's controlled-input value tracker treats a
    // no-op value assignment as a non-event otherwise.
    await waitFor(() => expect(input).not.toHaveAttribute('aria-disabled'));
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.change(input, { target: { value: 'Postgres' } });
    expect(await screen.findByText('Postgres')).toBeInTheDocument();
  });
});
