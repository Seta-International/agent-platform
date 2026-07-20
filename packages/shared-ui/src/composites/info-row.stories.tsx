import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../primitives/button';
import { InfoRow } from './info-row';

const meta: Meta<typeof InfoRow> = { title: 'composites/InfoRow', component: InfoRow };
export default meta;
type Story = StoryObj<typeof InfoRow>;

export const Default: Story = {
  render: () => (
    <InfoRow
      label="Google"
      value="Connected"
      action={<Button variant="ghost" size="sm" label="Disconnect" onClick={() => {}} />}
    />
  ),
};
