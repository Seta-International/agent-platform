import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Label } from './label';
import { Switch } from './switch';

const meta: Meta<typeof Switch> = { title: 'primitives/Switch', component: Switch };
export default meta;
type Story = StoryObj<typeof Switch>;

export const Default: Story = {
  render: () => {
    const [checked, setChecked] = useState(false);
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Switch id="sw-default" checked={checked} onCheckedChange={setChecked} />
          <Label htmlFor="sw-default">{checked ? 'Enabled' : 'Disabled'}</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="sw-checked" defaultChecked />
          <Label htmlFor="sw-checked">Default on</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="sw-disabled" disabled />
          <Label htmlFor="sw-disabled">Disabled off</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="sw-disabled-checked" checked disabled />
          <Label htmlFor="sw-disabled-checked">Disabled on</Label>
        </div>
      </div>
    );
  },
};
