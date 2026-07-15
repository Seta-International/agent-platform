import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

function renderPicker(showLevel?: boolean) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onChange = vi.fn();
  const utils = render(
    <QueryClientProvider client={qc}>
      <SkillPicker value={[]} onChange={onChange} showLevel={showLevel} />
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
  it('adds a picked skill with level 0 when a catalog skill is selected', async () => {
    const { onChange, qc } = renderPicker();
    const input = await screen.findByPlaceholderText(/search skills/i);
    await waitForCatalog(qc);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Postgres' } });
    fireEvent.click(await screen.findByText('Postgres'));
    expect(onChange).toHaveBeenCalledWith([{ skill_id: 's1', skill_name: 'Postgres', level: 0 }]);
  });

  it('omits inactive catalog skills from the dropdown', async () => {
    const { qc } = renderPicker();
    const input = await screen.findByPlaceholderText(/search skills/i);
    await waitForCatalog(qc);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Retired' } });
    expect(screen.queryByText('Retired')).toBeNull();
  });
});
