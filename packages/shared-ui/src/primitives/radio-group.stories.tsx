import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { RadioGroup, RadioListItem } from './radio-group';

const meta: Meta<typeof RadioGroup> = { title: 'primitives/RadioGroup', component: RadioGroup };
export default meta;
type Story = StoryObj<typeof RadioGroup>;

export const Default: Story = {
  render: () => {
    const [value, setValue] = useState('option-one');
    return (
      <RadioGroup label="Options" value={value} onChange={setValue}>
        <RadioListItem value="option-one" label="Option one" />
        <RadioListItem value="option-two" label="Option two" />
        <RadioListItem value="option-three" label="Option three" />
      </RadioGroup>
    );
  },
};

export const WithDisabled: Story = {
  render: () => {
    const [value, setValue] = useState('active');
    return (
      <RadioGroup label="Status" value={value} onChange={setValue}>
        <RadioListItem value="active" label="Active" />
        <RadioListItem value="disabled" label="Disabled option" isDisabled />
      </RadioGroup>
    );
  },
};
