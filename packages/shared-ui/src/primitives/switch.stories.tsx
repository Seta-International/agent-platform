import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Switch } from './switch';

const meta: Meta<typeof Switch> = { title: 'primitives/Switch', component: Switch };
export default meta;
type Story = StoryObj<typeof Switch>;

export const Default: Story = {
  render: () => {
    const [checked, setChecked] = useState(false);
    return (
      <div className="flex flex-col gap-4">
        <Switch label={checked ? 'Enabled' : 'Disabled'} value={checked} onChange={setChecked} />
        <Switch label="Default on" value />
        <Switch label="Disabled off" value={false} isDisabled />
        <Switch label="Disabled on" value isDisabled />
      </div>
    );
  },
};
