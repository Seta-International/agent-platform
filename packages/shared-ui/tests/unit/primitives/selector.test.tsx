import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Selector } from '../../../src/primitives/selector';

const options = [
  { value: 'bucket', label: 'Bucket' },
  { value: 'assignee', label: 'Assignee' },
];

describe('Selector', () => {
  it('renders an accessible combobox with the label; no options visible when closed', () => {
    render(
      <Selector
        label="Group by"
        options={options}
        value={undefined}
        onChange={() => {}}
        placeholder="Pick one"
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Group by' })).toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('opens the listbox and selects an option, firing onChange with the value', async () => {
    const onChange = vi.fn();
    render(<Selector label="Group by" options={options} value={undefined} onChange={onChange} />);
    await userEvent.click(screen.getByRole('combobox', { name: 'Group by' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Assignee' }));
    expect(onChange).toHaveBeenCalledWith('assignee');
  });

  it('reflects the selected value on the trigger', () => {
    render(<Selector label="Group by" options={options} value="bucket" onChange={() => {}} />);
    expect(screen.getByRole('combobox', { name: 'Group by' })).toHaveTextContent('Bucket');
  });

  it('supports isLabelHidden while keeping the accessible name', () => {
    render(
      <Selector
        label="Status filter"
        isLabelHidden
        options={options}
        value={undefined}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Status filter' })).toBeInTheDocument();
  });
});
