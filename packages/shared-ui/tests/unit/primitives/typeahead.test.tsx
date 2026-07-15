import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  createStaticSource,
  type SearchableItem,
  Typeahead,
} from '../../../src/primitives/typeahead';

const items: SearchableItem[] = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Bravo' },
];
const source = createStaticSource(items);

describe('Typeahead', () => {
  it('renders an accessible combobox with the label', () => {
    render(
      <Typeahead
        label="Pick one"
        searchSource={source}
        value={null}
        onChange={() => {}}
        debounceMs={0}
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Pick one' })).toBeInTheDocument();
  });

  it('searches and selects an item, firing onChange with the item', async () => {
    const onChange = vi.fn();
    render(
      <Typeahead
        label="Pick one"
        searchSource={source}
        value={null}
        onChange={onChange}
        debounceMs={0}
        hasEntriesOnFocus
      />,
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Pick one' }));
    await userEvent.type(screen.getByRole('combobox', { name: 'Pick one' }), 'Bra');
    await userEvent.click(await screen.findByRole('option', { name: 'Bravo' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'b', label: 'Bravo' }));
  });

  it('reflects the selected item', () => {
    render(
      <Typeahead
        label="Pick one"
        searchSource={source}
        value={items[0]!}
        onChange={() => {}}
        debounceMs={0}
      />,
    );
    expect(screen.getByText('Alpha')).toBeInTheDocument();
  });
});
