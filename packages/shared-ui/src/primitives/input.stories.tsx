import type { Meta, StoryObj } from '@storybook/react-vite';
import { Input } from './input';
import { Label } from './label';

const meta: Meta<typeof Input> = { title: 'primitives/Input', component: Input };
export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {
  render: () => (
    <div className="flex flex-col gap-4 w-72">
      <div className="flex flex-col gap-1">
        <Label htmlFor="input-default">Default</Label>
        <Input id="input-default" placeholder="Enter value…" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="input-disabled">Disabled</Label>
        <Input id="input-disabled" placeholder="Disabled" disabled />
      </div>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col gap-4 w-72">
      <div className="flex flex-col gap-1">
        <Label>Small</Label>
        <Input size="sm" placeholder="Small input" />
      </div>
      <div className="flex flex-col gap-1">
        <Label>Default</Label>
        <Input size="default" placeholder="Default input" />
      </div>
      <div className="flex flex-col gap-1">
        <Label>Large</Label>
        <Input size="lg" placeholder="Large input" />
      </div>
    </div>
  ),
};
