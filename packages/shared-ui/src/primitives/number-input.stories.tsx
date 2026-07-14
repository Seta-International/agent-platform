import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { NumberInput } from './number-input';

const meta: Meta<typeof NumberInput> = { title: 'primitives/NumberInput', component: NumberInput };
export default meta;
type Story = StoryObj<typeof NumberInput>;

export const Default: Story = {
  render: () => {
    const [value, setValue] = useState<number | null>(1);
    return (
      <div className="flex flex-col gap-4 w-72">
        <NumberInput label="Quantity" value={value} onChange={setValue} min={0} />
        <NumberInput label="Disabled" value={5} isDisabled onChange={() => {}} />
      </div>
    );
  },
};

export const WithUnitsAndStep: Story = {
  render: () => {
    const [pct, setPct] = useState<number | null>(50);
    const [effort, setEffort] = useState<number | null>(1.5);
    return (
      <div className="flex flex-col gap-4 w-72">
        <NumberInput
          label="Allocation %"
          value={pct}
          onChange={setPct}
          min={0}
          max={100}
          units="%"
        />
        <NumberInput label="Effort (MM)" value={effort} onChange={setEffort} min={0} step={0.25} />
        <NumberInput label="Headcount" value={1} onChange={() => {}} min={1} isIntegerOnly />
      </div>
    );
  },
};
