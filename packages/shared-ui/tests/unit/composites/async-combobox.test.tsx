import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AsyncCombobox, type EntityOption } from '../../../src/composites/async-combobox';

const PEOPLE: EntityOption[] = [
  { value: 'w1', label: 'Alice Smith' },
  { value: 'w2', label: 'Bob Jones' },
];
const search = (q: string) =>
  Promise.resolve(PEOPLE.filter((p) => p.label.toLowerCase().includes(q.toLowerCase())));
const resolveByIds = (ids: string[]) =>
  Promise.resolve(PEOPLE.filter((p) => ids.includes(p.value)));

function SingleHarness({ initial = null }: { initial?: string | null }) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <AsyncCombobox
      value={value}
      onChange={setValue}
      search={search}
      resolveByIds={resolveByIds}
      placeholder="Select worker"
    />
  );
}

describe('AsyncCombobox', () => {
  it('searches remotely and selects an option', async () => {
    const user = userEvent.setup();
    render(<SingleHarness />);
    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByPlaceholderText(/search/i), 'ali');
    const option = await screen.findByText('Alice Smith');
    await user.click(option);
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveTextContent('Alice Smith'));
  });

  it('hydrates a preset value into its label (no raw id shown)', async () => {
    render(<SingleHarness initial="w2" />);
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveTextContent('Bob Jones'));
    expect(screen.queryByText('w2')).not.toBeInTheDocument();
  });

  it('calls search debounced (one call for rapid typing)', async () => {
    const spy = vi.fn(search);
    const user = userEvent.setup();
    function H() {
      const [v, setV] = useState<string | null>(null);
      return <AsyncCombobox value={v} onChange={setV} search={spy} resolveByIds={resolveByIds} />;
    }
    render(<H />);
    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByPlaceholderText(/search/i), 'alice');
    await waitFor(() => expect(spy).toHaveBeenCalled());
    // debounced: far fewer calls than the 5 keystrokes
    expect(spy.mock.calls.length).toBeLessThan(5);
  });
});
