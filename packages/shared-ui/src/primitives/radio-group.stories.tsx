import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Label } from './label';
import { RadioGroup, RadioGroupItem } from './radio-group';

const meta: Meta<typeof RadioGroup> = { title: 'primitives/RadioGroup', component: RadioGroup };
export default meta;
type Story = StoryObj<typeof RadioGroup>;

export const Default: Story = {
  render: () => {
    const [value, setValue] = useState('option-one');
    return (
      <RadioGroup value={value} onValueChange={setValue}>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="option-one" id="rg-one" />
          <Label htmlFor="rg-one">Option one</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="option-two" id="rg-two" />
          <Label htmlFor="rg-two">Option two</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="option-three" id="rg-three" />
          <Label htmlFor="rg-three">Option three</Label>
        </div>
      </RadioGroup>
    );
  },
};

export const WithDisabled: Story = {
  render: () => (
    <RadioGroup defaultValue="active">
      <div className="flex items-center gap-2">
        <RadioGroupItem value="active" id="rg-active" />
        <Label htmlFor="rg-active">Active</Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="disabled" id="rg-disabled" disabled />
        <Label htmlFor="rg-disabled">Disabled option</Label>
      </div>
    </RadioGroup>
  ),
};
