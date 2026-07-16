import type { Meta, StoryObj } from '@storybook/react-vite';
import { Avatar, AvatarGroup, AvatarGroupOverflow } from './avatar';

const meta: Meta<typeof Avatar> = { title: 'primitives/Avatar', component: Avatar };
export default meta;
type Story = StoryObj<typeof Avatar>;

export const WithImage: Story = {
  render: () => <Avatar src="https://github.com/shadcn.png" name="Shadcn" />,
};

export const WithInitials: Story = {
  render: () => <Avatar name="Chi Tran" />,
};

export const FallsBackToInitials: Story = {
  render: () => <Avatar src="/broken-image.png" name="Chi Tran" />,
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Avatar src="https://github.com/shadcn.png" name="Small" size={24} />
      <Avatar src="https://github.com/shadcn.png" name="Medium" size={40} />
      <Avatar src="https://github.com/shadcn.png" name="Large" size={60} />
    </div>
  ),
};

export const Group: Story = {
  render: () => (
    <AvatarGroup>
      <Avatar src="https://github.com/shadcn.png" name="Ana Ruiz" />
      <Avatar name="Binh Le" />
      <Avatar name="Cam Do" />
      <AvatarGroupOverflow count={4} />
    </AvatarGroup>
  ),
};
