import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Combobox, type ComboboxOption } from '../../../src/composites/combobox';

const opts: ComboboxOption[] = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana' },
  { value: 'c', label: 'Cherry' },
];

function getTrigger() {
  return screen.getByRole('combobox');
}

describe('Combobox (single)', () => {
  it('shows the placeholder when no value is selected', () => {
    render(<Combobox options={opts} value={null} onChange={() => {}} placeholder="Pick a fruit" />);
    expect(getTrigger()).toHaveTextContent('Pick a fruit');
  });

  it('shows the selected option label', () => {
    render(<Combobox options={opts} value="b" onChange={() => {}} placeholder="Pick a fruit" />);
    expect(getTrigger()).toHaveTextContent('Banana');
  });

  it('opens on click and selects an option, calling onChange with its value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Combobox options={opts} value={null} onChange={onChange} placeholder="Pick" />);

    await user.click(getTrigger());
    await user.click(screen.getByRole('option', { name: 'Cherry' }));

    expect(onChange).toHaveBeenCalledWith('c');
  });

  it('filters options via the search input', async () => {
    const user = userEvent.setup();
    render(<Combobox options={opts} value={null} onChange={() => {}} placeholder="Pick" />);

    await user.click(getTrigger());
    await user.type(screen.getByPlaceholderText('Search…'), 'ban');

    expect(screen.getByRole('option', { name: 'Banana' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Apple' })).not.toBeInTheDocument();
  });

  it('renders no search input when searchable is false', async () => {
    const user = userEvent.setup();
    render(
      <Combobox
        options={opts}
        value={null}
        onChange={() => {}}
        placeholder="Pick"
        searchable={false}
      />,
    );
    await user.click(getTrigger());
    expect(screen.queryByPlaceholderText('Search…')).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Apple' })).toBeInTheDocument();
  });
});

describe('Combobox (multiple)', () => {
  it('renders a chip for each selected value', () => {
    render(<Combobox multiple options={opts} value={['a', 'c']} onChange={() => {}} />);
    const trigger = getTrigger();
    expect(within(trigger).getByText('Apple')).toBeInTheDocument();
    expect(within(trigger).getByText('Cherry')).toBeInTheDocument();
  });

  it('adds a value when an unselected option is picked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Combobox multiple options={opts} value={['a']} onChange={onChange} />);

    await user.click(getTrigger());
    await user.click(screen.getByRole('option', { name: 'Banana' }));

    expect(onChange).toHaveBeenCalledWith(['a', 'b']);
  });

  it('removes a value when a selected option is picked again', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Combobox multiple options={opts} value={['a', 'b']} onChange={onChange} />);

    await user.click(getTrigger());
    await user.click(screen.getByRole('option', { name: 'Apple' }));

    expect(onChange).toHaveBeenCalledWith(['b']);
  });

  it('removes a value via its chip remove button', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Combobox multiple options={opts} value={['a', 'b']} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Remove Apple' }));

    expect(onChange).toHaveBeenCalledWith(['b']);
  });
});
