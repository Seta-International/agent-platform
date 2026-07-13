import type { Meta, StoryObj } from '@storybook/react-vite';
import { Skeleton } from './skeleton';

const meta: Meta<typeof Skeleton> = { title: 'primitives/Skeleton', component: Skeleton };
export default meta;
type Story = StoryObj<typeof Skeleton>;

export const Default: Story = {
  render: () => <Skeleton height={16} width={192} />,
};

export const CardSkeleton: Story = {
  render: () => (
    <div className="flex flex-col gap-3 w-64">
      <Skeleton height={128} radius={2} />
      <Skeleton height={16} width="75%" />
      <Skeleton height={16} width="50%" />
    </div>
  ),
};

export const ProfileSkeleton: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Skeleton height={40} width={40} radius="rounded" />
      <div className="flex flex-col gap-2">
        <Skeleton height={16} width={128} />
        <Skeleton height={12} width={96} />
      </div>
    </div>
  ),
};

export const ListSkeleton: Story = {
  render: () => (
    <div className="flex flex-col gap-2 w-64">
      {Array.from({ length: 4 }, (_, i) => `row-${i}`).map((row) => (
        <div key={row} className="flex items-center gap-3">
          <Skeleton height={32} width={32} radius="rounded" className="shrink-0" />
          <div className="flex flex-col gap-1.5 flex-1">
            <Skeleton height={12} />
            <Skeleton height={12} width="66.6667%" />
          </div>
        </div>
      ))}
    </div>
  ),
};
