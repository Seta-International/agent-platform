import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MultiFilterPill } from './filter-pill';

const options = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Bravo' },
  { value: 'c', label: 'Charlie' },
] as const;

describe('MultiFilterPill', () => {
  it('shows the anyLabel when no values are selected', () => {
    render(
      <MultiFilterPill
        label="Assignee"
        values={[]}
        options={options}
        onChange={() => {}}
        anyLabel="Anyone"
      />,
    );
    expect(screen.getByText('Anyone')).toBeInTheDocument();
  });

  it('shows the single label when exactly one value is selected', () => {
    render(<MultiFilterPill label="Label" values={['b']} options={options} onChange={() => {}} />);
    expect(screen.getByText('Bravo')).toBeInTheDocument();
  });

  it('shows the count when more than one value is selected', () => {
    render(
      <MultiFilterPill label="Label" values={['a', 'c']} options={options} onChange={() => {}} />,
    );
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('toggles a value when an option is clicked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<MultiFilterPill label="Label" values={[]} options={options} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /^Label filter$/i }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Alpha' }));
    expect(onChange).toHaveBeenCalledWith(['a']);
  });

  it('un-toggles a value when clicked again', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <MultiFilterPill label="Label" values={['a', 'b']} options={options} onChange={onChange} />,
    );
    await user.click(screen.getByRole('button', { name: /^Label filter$/i }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Alpha' }));
    expect(onChange).toHaveBeenCalledWith(['b']);
  });

  it('clears all values via the inline clear button', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<MultiFilterPill label="Label" values={['a']} options={options} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /Clear Label filter/i }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
