import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { DateInput } from './date-input';

const meta: Meta<typeof DateInput> = { title: 'primitives/DateInput', component: DateInput };
export default meta;
type Story = StoryObj<typeof DateInput>;

export const Default: Story = {
  render: () => {
    const [value, setValue] = useState<string | undefined>('2026-07-14');
    return (
      <div className="flex flex-col gap-4 w-72">
        <DateInput label="Start date" value={value} onChange={setValue} />
        <DateInput label="Disabled" value="2026-01-01" isDisabled onChange={() => {}} />
      </div>
    );
  },
};

export const WithConstraintsAndClear: Story = {
  render: () => {
    const [start, setStart] = useState<string | undefined>('2026-07-01');
    const [due, setDue] = useState<string | undefined>('2026-07-31');
    return (
      <div className="flex flex-col gap-4 w-72">
        <DateInput
          label="Start date"
          value={start}
          max={due}
          hasClear
          onChange={(v) => setStart(v)}
        />
        <DateInput label="Due date" value={due} min={start} hasClear onChange={(v) => setDue(v)} />
        <DateInput
          label="Compact filter"
          isLabelHidden
          size="sm"
          value={start}
          onChange={setStart}
        />
      </div>
    );
  },
};
