import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Tokenizer } from '../../../src/primitives/tokenizer';
import { createStaticSource, type SearchableItem } from '../../../src/primitives/typeahead';

const items: SearchableItem[] = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Bravo' },
];
const source = createStaticSource(items);

describe('Tokenizer', () => {
  it('selects an item and reports it via a TokenizerChange of type "add"', async () => {
    const onChange = vi.fn();
    render(<Tokenizer label="Pick many" searchSource={source} value={[]} onChange={onChange} />);
    await userEvent.click(screen.getByRole('combobox', { name: 'Pick many' }));
    await userEvent.type(screen.getByRole('combobox', { name: 'Pick many' }), 'Alp');
    await userEvent.click(await screen.findByRole('option', { name: 'Alpha' }));
    // TokenizerChange is a discriminated union — `{ type: 'add', item: T }` (no `added` field).
    expect(onChange).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'a' })],
      expect.objectContaining({ type: 'add', item: expect.objectContaining({ id: 'a' }) }),
    );
  });
});
