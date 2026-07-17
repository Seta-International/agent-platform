import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Checkbox } from './checkbox';

const meta: Meta<typeof Checkbox> = { title: 'primitives/Checkbox', component: Checkbox };
export default meta;
type Story = StoryObj<typeof Checkbox>;

export const Default: Story = {
  render: () => {
    const [checked, setChecked] = useState<boolean | 'indeterminate'>(false);
    return (
      <div className="flex flex-col gap-4">
        <Checkbox
          label="Accept terms and conditions"
          value={checked}
          onChange={(v) => setChecked(v)}
        />
        <Checkbox label="Indeterminate" value="indeterminate" />
        <Checkbox label="Disabled unchecked" value={false} isDisabled />
        <Checkbox label="Disabled checked" value isDisabled />
      </div>
    );
  },
};
