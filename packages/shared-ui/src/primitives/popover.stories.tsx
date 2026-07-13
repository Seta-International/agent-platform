import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

const meta: Meta = { title: 'primitives/Popover' };
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" label="Open popover" />
      </PopoverTrigger>
      <PopoverContent>
        <div className="flex flex-col gap-2">
          <p className="text-body-sm font-medium text-ink">Filter by status</p>
          <p className="text-caption text-ink-subtle">
            Select one or more statuses to narrow the task list.
          </p>
          <div className="flex flex-col gap-1 pt-1">
            {['To do', 'In progress', 'Done', 'Cancelled'].map((s) => (
              <label key={s} className="flex items-center gap-2 text-body-sm text-ink">
                <input type="checkbox" className="accent-primary" />
                {s}
              </label>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  ),
};

export const AlignStart: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" label="Align start" />
      </PopoverTrigger>
      <PopoverContent align="start">
        <p className="text-body-sm text-ink">Popover aligned to the start of the trigger.</p>
      </PopoverContent>
    </Popover>
  ),
};
