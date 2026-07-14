import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { TimeInput } from './time-input';

const meta: Meta<typeof TimeInput> = { title: 'primitives/TimeInput', component: TimeInput };
export default meta;
type Story = StoryObj<typeof TimeInput>;

export const Default: Story = {
  render: () => {
    const [value, setValue] = useState<string | undefined>('09:00');
    return (
      <div className="flex flex-col gap-4 w-72">
        <TimeInput label="Start time" hourFormat="24h" value={value} onChange={setValue} />
        <TimeInput label="Disabled" hourFormat="24h" value="17:00" isDisabled onChange={() => {}} />
      </div>
    );
  },
};

export const WorkingHoursPair: Story = {
  render: () => {
    const [start, setStart] = useState<string | undefined>('09:00');
    const [end, setEnd] = useState<string | undefined>('17:30');
    return (
      <div className="flex items-center gap-2">
        <TimeInput
          label="Working hours start"
          isLabelHidden
          hourFormat="24h"
          value={start}
          onChange={setStart}
        />
        <span className="text-ink-muted text-sm">to</span>
        <TimeInput
          label="Working hours end"
          isLabelHidden
          hourFormat="24h"
          value={end}
          onChange={setEnd}
        />
      </div>
    );
  },
};
