import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Input } from './input';

const meta: Meta<typeof Input> = { title: 'primitives/Input', component: Input };
export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {
  render: () => {
    const [value, setValue] = useState('');
    return (
      <div className="flex flex-col gap-4 w-72">
        <Input label="Default" value={value} onChange={setValue} placeholder="Enter value…" />
        <Input label="Disabled" value="Disabled" onChange={() => {}} isDisabled />
      </div>
    );
  },
};

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col gap-4 w-72">
      <Input label="Small" size="sm" value="" onChange={() => {}} placeholder="Small input" />
      <Input label="Default" size="md" value="" onChange={() => {}} placeholder="Default input" />
      <Input label="Large" size="lg" value="" onChange={() => {}} placeholder="Large input" />
    </div>
  ),
};
