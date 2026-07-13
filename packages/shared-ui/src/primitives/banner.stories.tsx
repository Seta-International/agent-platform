import type { Meta, StoryObj } from '@storybook/react-vite';
import { Banner } from './banner';

const meta: Meta<typeof Banner> = { title: 'primitives/Banner', component: Banner };
export default meta;
type Story = StoryObj<typeof Banner>;

export const Default: Story = {
  render: () => <Banner status="info" title="You can add components to your app using the CLI." />,
};

export const Destructive: Story = {
  render: () => <Banner status="error" title="Your session has expired. Please sign in again." />,
};

export const Warning: Story = {
  render: () => (
    <Banner status="warning" title="This action cannot be undone. Proceed with caution." />
  ),
};

export const Info: Story = {
  render: () => (
    <Banner status="info" title="A new software update is available. See what's new." />
  ),
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <Banner status="info" title="Default banner description." />
      <Banner status="error" title="Destructive banner description." />
      <Banner status="warning" title="Warning banner description." />
      <Banner status="info" title="Info banner description." />
    </div>
  ),
};
