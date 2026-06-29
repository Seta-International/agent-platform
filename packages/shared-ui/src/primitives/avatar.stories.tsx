import type { Meta, StoryObj } from '@storybook/react-vite';
import { Avatar, AvatarFallback, AvatarImage } from './avatar';

const meta: Meta<typeof Avatar> = { title: 'primitives/Avatar', component: Avatar };
export default meta;
type Story = StoryObj<typeof Avatar>;

export const WithImage: Story = {
  render: () => (
    <Avatar>
      <AvatarImage src="https://github.com/shadcn.png" alt="shadcn" />
      <AvatarFallback>SC</AvatarFallback>
    </Avatar>
  ),
};

export const WithFallback: Story = {
  render: () => (
    <Avatar>
      <AvatarImage src="/broken-image.png" alt="User" />
      <AvatarFallback>CT</AvatarFallback>
    </Avatar>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Avatar className="h-6 w-6">
        <AvatarImage src="https://github.com/shadcn.png" alt="small" />
        <AvatarFallback>SM</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarImage src="https://github.com/shadcn.png" alt="default" />
        <AvatarFallback>MD</AvatarFallback>
      </Avatar>
      <Avatar className="h-14 w-14">
        <AvatarImage src="https://github.com/shadcn.png" alt="large" />
        <AvatarFallback>LG</AvatarFallback>
      </Avatar>
    </div>
  ),
};

export const Group: Story = {
  render: () => (
    <div className="flex -space-x-2">
      <Avatar className="border-2 border-canvas">
        <AvatarImage src="https://github.com/shadcn.png" alt="user 1" />
        <AvatarFallback>A1</AvatarFallback>
      </Avatar>
      <Avatar className="border-2 border-canvas">
        <AvatarFallback>A2</AvatarFallback>
      </Avatar>
      <Avatar className="border-2 border-canvas">
        <AvatarFallback>A3</AvatarFallback>
      </Avatar>
    </div>
  ),
};
