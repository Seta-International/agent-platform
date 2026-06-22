import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Checkbox } from './checkbox';
import { Label } from './label';

const meta: Meta<typeof Checkbox> = { title: 'primitives/Checkbox', component: Checkbox };
export default meta;
type Story = StoryObj<typeof Checkbox>;

export const Default: Story = {
  render: () => {
    const [checked, setChecked] = useState<boolean | 'indeterminate'>(false);
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Checkbox id="cb-default" checked={checked} onCheckedChange={setChecked} />
          <Label htmlFor="cb-default">Accept terms and conditions</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="cb-indeterminate" checked="indeterminate" />
          <Label htmlFor="cb-indeterminate">Indeterminate</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="cb-disabled" disabled />
          <Label htmlFor="cb-disabled">Disabled unchecked</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="cb-disabled-checked" checked disabled />
          <Label htmlFor="cb-disabled-checked">Disabled checked</Label>
        </div>
      </div>
    );
  },
};
