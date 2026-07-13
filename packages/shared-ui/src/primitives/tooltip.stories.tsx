import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

const meta: Meta = { title: 'primitives/Tooltip' };
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="secondary" label="Hover me" />
        </TooltipTrigger>
        <TooltipContent>Save changes</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
};

export const Multiple: Story = {
  render: () => (
    <TooltipProvider>
      <div className="flex gap-3">
        {[
          { label: 'Edit', tip: 'Edit this record' },
          { label: 'Duplicate', tip: 'Create a copy' },
          { label: 'Archive', tip: 'Move to archive' },
          { label: 'Delete', tip: 'Permanently delete' },
        ].map(({ label, tip }) => (
          <Tooltip key={label}>
            <TooltipTrigger asChild>
              <Button variant="secondary" size="sm" label={label} />
            </TooltipTrigger>
            <TooltipContent>{tip}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  ),
};
