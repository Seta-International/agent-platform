import type { Meta, StoryObj } from '@storybook/react-vite';
import { Checkbox } from './checkbox';
import { Input } from './input';
import { Label } from './label';

const meta: Meta<typeof Label> = { title: 'primitives/Label', component: Label };
export default meta;
type Story = StoryObj<typeof Label>;

export const Default: Story = {
  render: () => (
    <div className="flex flex-col gap-4 w-72">
      <div className="flex flex-col gap-1">
        <Label htmlFor="label-input">Email address</Label>
        <Input id="label-input" type="email" placeholder="you@example.com" />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="label-checkbox" />
        <Label htmlFor="label-checkbox">Subscribe to updates</Label>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="label-disabled-input">Disabled field</Label>
        <Input id="label-disabled-input" placeholder="Disabled" disabled />
      </div>
    </div>
  ),
};
