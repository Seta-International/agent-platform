import type { Meta, StoryObj } from '@storybook/react-vite';
import { ScrollArea, ScrollBar } from './scroll-area';

const meta: Meta = { title: 'primitives/ScrollArea' };
export default meta;
type Story = StoryObj;

const ITEMS = Array.from({ length: 30 }, (_, i) => `Item ${i + 1}`);

export const Default: Story = {
  render: () => (
    <ScrollArea className="h-64 w-64 rounded-md border border-hairline p-2">
      <div className="flex flex-col gap-1">
        {ITEMS.map((item) => (
          <div key={item} className="rounded px-3 py-1.5 text-body-sm hover:bg-surface-2">
            {item}
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
};

export const Horizontal: Story = {
  render: () => (
    <ScrollArea className="w-72 whitespace-nowrap rounded-md border border-hairline">
      <div className="flex gap-3 p-4">
        {Array.from({ length: 20 }, (_, i) => `Card ${i + 1}`).map((card) => (
          <div
            key={card}
            className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md bg-surface-2 text-body-sm"
          >
            {card}
          </div>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  ),
};
