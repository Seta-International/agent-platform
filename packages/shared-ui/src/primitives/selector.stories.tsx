import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Selector } from './selector';

const meta: Meta<typeof Selector> = { title: 'primitives/Selector' };
export default meta;
type Story = StoryObj<typeof Selector>;

const options = [
  { value: 'bucket', label: 'Bucket' },
  { value: 'assignee', label: 'Assignee' },
  { value: 'priority', label: 'Priority' },
];

function Demo(props: { isLabelHidden?: boolean; hasClear?: boolean }) {
  const [value, setValue] = useState<string | null>(null);
  return (
    <Selector
      label="Group by"
      isLabelHidden={props.isLabelHidden}
      hasClear={props.hasClear as never}
      options={options}
      value={value as never}
      onChange={setValue as never}
      placeholder="Select…"
    />
  );
}

export const Default: Story = { render: () => <Demo /> };
export const LabelHidden: Story = { render: () => <Demo isLabelHidden /> };
export const Clearable: Story = { render: () => <Demo hasClear /> };
export const Disabled: Story = {
  render: () => (
    <Selector label="Group by" options={options} value="bucket" onChange={() => {}} isDisabled />
  ),
};
