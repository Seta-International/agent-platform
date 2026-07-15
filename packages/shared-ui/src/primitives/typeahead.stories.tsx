import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { createStaticSource, type SearchableItem, type SearchSource, Typeahead } from './typeahead';

const meta: Meta<typeof Typeahead> = { title: 'primitives/Typeahead' };
export default meta;
type Story = StoryObj<typeof Typeahead>;

const FRUITS: SearchableItem[] = [
  { id: 'apple', label: 'Apple' },
  { id: 'banana', label: 'Banana' },
  { id: 'cherry', label: 'Cherry' },
  { id: 'date', label: 'Date' },
  { id: 'elderberry', label: 'Elderberry' },
];
const staticSource = createStaticSource(FRUITS);

/** Stub async source — simulates a debounced remote lookup over the same list. */
const asyncSource: SearchSource<SearchableItem> = {
  search: (query) =>
    new Promise((resolve) => {
      setTimeout(
        () => resolve(FRUITS.filter((f) => f.label.toLowerCase().includes(query.toLowerCase()))),
        150,
      );
    }),
  bootstrap: () => Promise.resolve(FRUITS.slice(0, 3)),
};

function Demo(props: { source: SearchSource<SearchableItem>; debounceMs?: number }) {
  const [value, setValue] = useState<SearchableItem | null>(null);
  return (
    <Typeahead
      label="Favorite fruit"
      searchSource={props.source}
      value={value}
      onChange={setValue}
      placeholder="Search fruits…"
      debounceMs={props.debounceMs}
    />
  );
}

export const Default: Story = { render: () => <Demo source={staticSource} debounceMs={0} /> };
export const AsyncSource: Story = { render: () => <Demo source={asyncSource} /> };
export const Disabled: Story = {
  render: () => (
    <Typeahead
      label="Favorite fruit"
      searchSource={staticSource}
      value={FRUITS[0] ?? null}
      onChange={() => {}}
      isDisabled
      debounceMs={0}
    />
  ),
};
