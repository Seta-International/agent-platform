import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { Combobox, type ComboboxOption } from './combobox';

const FRUITS: ComboboxOption[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
  { value: 'date', label: 'Date' },
  { value: 'elderberry', label: 'Elderberry' },
  { value: 'fig', label: 'Fig' },
  { value: 'grape', label: 'Grape' },
];

const meta: Meta<typeof Combobox> = {
  title: 'Composites/Combobox',
  component: Combobox,
  parameters: { layout: 'centered' },
};
export default meta;

type Story = StoryObj<typeof Combobox>;

export const Single: Story = {
  render: () => {
    const [value, setValue] = useState<string | null>(null);
    return (
      <div className="w-64">
        <Combobox options={FRUITS} value={value} onChange={setValue} placeholder="Pick a fruit" />
      </div>
    );
  },
};

export const Multiple: Story = {
  render: () => {
    const [value, setValue] = useState<string[]>(['apple', 'cherry']);
    return (
      <div className="w-64">
        <Combobox
          multiple
          options={FRUITS}
          value={value}
          onChange={setValue}
          placeholder="Pick fruits"
        />
      </div>
    );
  },
};

export const MultipleWithOverflow: Story = {
  render: () => {
    const [value, setValue] = useState<string[]>(['apple', 'banana', 'cherry', 'date']);
    return (
      <div className="w-64">
        <Combobox
          multiple
          maxChips={2}
          options={FRUITS}
          value={value}
          onChange={setValue}
          placeholder="Pick fruits"
        />
      </div>
    );
  },
};

export const NotSearchable: Story = {
  render: () => {
    const [value, setValue] = useState<string | null>('banana');
    return (
      <div className="w-64">
        <Combobox
          searchable={false}
          options={FRUITS}
          value={value}
          onChange={setValue}
          placeholder="Pick a fruit"
        />
      </div>
    );
  },
};

export const Disabled: Story = {
  render: () => (
    <div className="w-64">
      <Combobox disabled options={FRUITS} value="apple" onChange={() => {}} />
    </div>
  ),
};
