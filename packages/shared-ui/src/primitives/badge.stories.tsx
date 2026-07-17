import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from './badge';

const meta: Meta<typeof Badge> = { title: 'primitives/Badge', component: Badge };
export default meta;
type Story = StoryObj<typeof Badge>;

export const Default: Story = {
  render: () => <Badge label="Default" />,
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="neutral" label="Neutral" />
      <Badge variant="info" label="Info" />
      <Badge variant="success" label="Success" />
      <Badge variant="warning" label="Warning" />
      <Badge variant="error" label="Error" />
    </div>
  ),
};
