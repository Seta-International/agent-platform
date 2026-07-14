import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Checkbox } from './checkbox';
import { Input } from './input';
import { Label } from './label';

const meta: Meta<typeof Label> = { title: 'primitives/Label', component: Label };
export default meta;
type Story = StoryObj<typeof Label>;

export const Default: Story = {
  render: () => {
    const [email, setEmail] = useState('');
    return (
      <div className="flex flex-col gap-4 w-72">
        <div className="flex flex-col gap-1">
          <Label>Email address</Label>
          <Input
            type="email"
            label="Email address"
            isLabelHidden
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
          />
        </div>
        <div className="flex items-center gap-2">
          <Checkbox label="Subscribe to updates" value={false} />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Disabled field</Label>
          <Input
            label="Disabled field"
            isLabelHidden
            value=""
            onChange={() => {}}
            placeholder="Disabled"
            isDisabled
          />
        </div>
      </div>
    );
  },
};
