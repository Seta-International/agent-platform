import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/api/hiring-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/api/hiring-client.ts')>()),
  fetchSkillCatalog: () =>
    Promise.resolve({
      categories: [{ id: 'c1', name: 'Languages', sort_order: 1, active: true }],
      skills: [
        { id: 's1', name: 'Java', category_id: 'c1', active: true },
        { id: 's2', name: 'Go', category_id: 'c1', active: true },
      ],
    }),
}));

import { SkillPicker } from '../../src/pages/skill-picker.tsx';

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe('SkillPicker', () => {
  it('adds an unselected skill on click', async () => {
    const onChange = vi.fn();
    render(<SkillPicker value={[]} onChange={onChange} />, { wrapper: wrap(newClient()) });

    await userEvent.click(screen.getByRole('button', { name: 'Add skill' }));
    await userEvent.click(await screen.findByRole('option', { name: /Java/ }));
    expect(onChange).toHaveBeenCalledWith([{ skill_id: 's1', skill_name: 'Java', level: 0 }]);
  });

  it('marks already-picked skills selected and deselects them on click', async () => {
    const onChange = vi.fn();
    render(
      <SkillPicker
        value={[{ skill_id: 's1', skill_name: 'Java', level: 2 }]}
        onChange={onChange}
      />,
      { wrapper: wrap(newClient()) },
    );

    await userEvent.click(screen.getByRole('button', { name: 'Add skill' }));
    const java = await screen.findByRole('option', { name: /Java/ });
    expect(java).toHaveAttribute('data-picked', 'true');
    const go = screen.getByRole('option', { name: /Go/ });
    expect(go).toHaveAttribute('data-picked', 'false');

    await userEvent.click(java);
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
