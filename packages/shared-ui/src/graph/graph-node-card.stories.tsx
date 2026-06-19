import type { Meta, StoryObj } from '@storybook/react-vite';
import { GraphNodeCard } from './graph-node-card';

const meta = { component: GraphNodeCard } satisfies Meta<typeof GraphNodeCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Surface: Story = { args: { title: 'Vo Thi Huong', subtitle: 'Engagement Manager' } };
export const Solid: Story = {
  args: { title: 'Operation', subtitle: 'Internal functions', tone: 'solid' },
};
export const Primary: Story = {
  args: { title: 'Nguyen Trung Hieu', subtitle: 'CEO', tone: 'primary' },
};
export const SquareAvatar: Story = {
  args: { title: 'AERIS', subtitle: 'PRJ-e1', avatarShape: 'square' },
};
export const WithCount: Story = {
  args: { title: 'Delivery', subtitle: 'Client accounts', count: 4 },
};
export const Selected: Story = { args: { title: 'Selected node', selected: true } };
export const Static: Story = { args: { title: 'Static node', interactive: false } };
export const Collapsible: Story = {
  args: {
    title: 'Team Lead',
    subtitle: 'Engineering',
    collapsible: true,
    onToggleCollapse: () => {},
  },
};
export const Collapsed: Story = {
  args: {
    title: 'Team Lead',
    subtitle: 'Engineering',
    collapsible: true,
    collapsed: true,
    descendantCount: 5,
    onToggleCollapse: () => {},
  },
};
